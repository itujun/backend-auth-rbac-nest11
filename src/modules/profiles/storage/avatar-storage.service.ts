import {
  Injectable,
  Logger,
  OnModuleInit,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, copyFile, unlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { DEFAULT_AVATAR_URL } from '../../../database/schema';

const AVATAR_SUBDIR = 'avatars';
const DEFAULT_AVATAR_FILENAME = 'default.png';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Format asli yang dilaporkan sharp SETELAH ia benar-benar membaca
// magic bytes file (bukan klaim Content-Type dari client). Ini yang
// jadi sumber kebenaran validasi, bukan ALLOWED_MIME_TYPES di atas.
const ALLOWED_SHARP_FORMATS = ['jpeg', 'png', 'webp'];
const AVATAR_DIMENSION = 512; // persegi, cukup untuk kebanyakan tampilan UI

@Injectable()
export class AvatarStorageService implements OnModuleInit {
  private readonly logger = new Logger(AvatarStorageService.name);

  constructor(private readonly configService: ConfigService) {}

  private get uploadRoot(): string {
    const uploadDir = this.configService.get<string>(
      'storage.uploadDir',
    ) as string;
    // process.cwd() = root project saat `node dist/src/main.js` dijalankan,
    // BUKAN __dirname (yang menunjuk ke dalam dist/) — folder upload harus
    // di luar dist supaya tidak ikut terhapus tiap `nest build` (deleteOutDir).
    return join(process.cwd(), uploadDir);
  }

  private get avatarDir(): string {
    return join(this.uploadRoot, AVATAR_SUBDIR);
  }

  /**
   * Dijalankan sekali saat aplikasi start: pastikan folder upload ada,
   * dan pastikan default avatar BENAR-BENAR ada di disk (bukan cuma
   * string path di kolom `avatar_url`) — di-copy dari asset yang
   * dibundel bersama source code (lihat nest-cli.json `assets` config).
   */
  async onModuleInit(): Promise<void> {
    await mkdir(this.avatarDir, { recursive: true });

    const defaultAvatarPath = join(this.avatarDir, DEFAULT_AVATAR_FILENAME);
    const alreadyExists = await this.fileExists(defaultAvatarPath);

    if (!alreadyExists) {
      // __dirname di runtime (dist/src/modules/profiles/storage) ->
      // ../assets/default-avatar.png (dist/src/modules/profiles/assets/...)
      const bundledSource = join(
        __dirname,
        '..',
        'assets',
        'default-avatar.png',
      );
      await copyFile(bundledSource, defaultAvatarPath);
      this.logger.log(`Default avatar disalin ke ${defaultAvatarPath}`);
    }
  }

  /**
   * Kompres + simpan avatar baru. Selalu dikonversi ke WebP (format
   * gambar modern dengan rasio kompresi terbaik) dan di-resize ke
   * ukuran persegi tetap — supaya file besar dari user (mis. foto HP
   * beresolusi tinggi) tidak membebani storage & bandwidth.
   */
  async saveAvatar(
    buffer: Buffer,
    mimetype: string,
    userId: number,
  ): Promise<string> {
    // Cek CEPAT berdasarkan Content-Type yang diklaim client — murah,
    // dan menolak kesalahan jujur (mis. upload PDF) lebih awal dengan
    // pesan yang jelas. TAPI ini BUKAN validasi keamanan yang bisa
    // diandalkan: client bebas mengklaim Content-Type apapun (mis.
    // file .ts yang di-rename jadi .jpg tetap bisa dikirim dengan
    // header "image/jpeg"). Karena itu WAJIB ada verifikasi kedua di
    // bawah yang membaca isi file sesungguhnya.
    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
      throw new UnsupportedMediaTypeException(
        `Tipe file "${mimetype}" tidak didukung. Gunakan JPEG, PNG, atau WebP.`,
      );
    }

    // Verifikasi SESUNGGUHNYA: minta sharp membaca magic bytes file dan
    // melaporkan format asli yang terdeteksi dari isinya, bukan dari
    // klaim Content-Type. Kalau buffer bukan gambar valid sama sekali
    // (atau formatnya di luar daftar yang kita izinkan), sharp akan
    // melempar error di sini — kita tangkap dan ubah jadi error 415
    // yang jelas untuk client, BUKAN biarkan bocor jadi 500.
    let detectedFormat: string | undefined;
    try {
      const metadata = await sharp(buffer).metadata();
      detectedFormat = metadata.format;
    } catch {
      throw new UnsupportedMediaTypeException(
        'File yang diupload bukan gambar yang valid atau rusak.',
      );
    }

    if (!detectedFormat || !ALLOWED_SHARP_FORMATS.includes(detectedFormat)) {
      throw new UnsupportedMediaTypeException(
        `Isi file terdeteksi sebagai "${detectedFormat ?? 'tidak dikenali'}", ` +
          'bukan JPEG/PNG/WebP yang valid — kemungkinan ekstensi file diubah manual.',
      );
    }

    let compressed: Buffer;
    try {
      compressed = await sharp(buffer)
        .resize(AVATAR_DIMENSION, AVATAR_DIMENSION, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      // Defense in depth: walau metadata() di atas sudah lolos, file
      // corrupt tertentu bisa gagal di tahap decode penuh. Tetap map
      // ke error milik CLIENT (415), bukan 500.
      throw new UnsupportedMediaTypeException(
        'Gagal memproses gambar — file kemungkinan rusak.',
      );
    }

    // Nama file unik per upload (bukan overwrite nama tetap) supaya
    // browser/CDN cache lama tidak nyangkut menampilkan avatar basi.
    const filename = `user-${userId}-${randomUUID()}.webp`;
    const filePath = join(this.avatarDir, filename);

    await mkdir(this.avatarDir, { recursive: true });
    await sharp(compressed).toFile(filePath);

    return `/uploads/${AVATAR_SUBDIR}/${filename}`;
  }

  /**
   * Hapus file avatar lama dari disk — dipanggil setelah avatar baru
   * berhasil disimpan, ATAU saat avatar direset ke default. TIDAK
   * PERNAH menghapus default avatar itu sendiri (dicek via URL match).
   */
  async deleteIfCustom(avatarUrl: string | null): Promise<void> {
    if (!avatarUrl || avatarUrl === DEFAULT_AVATAR_URL) {
      return;
    }

    const filename = avatarUrl.split('/').pop();
    if (!filename) return;

    const filePath = join(this.avatarDir, filename);

    try {
      await unlink(filePath);
    } catch (err) {
      // File sudah tidak ada / gagal dihapus -> log saja, jangan sampai
      // request user gagal gara-gara cleanup file lama tidak krusial.
      this.logger.warn(
        `Gagal menghapus avatar lama "${filePath}": ${String(err)}`,
      );
    }
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
