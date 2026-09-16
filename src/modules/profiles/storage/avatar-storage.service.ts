import {
  Injectable,
  Logger,
  OnModuleInit,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, copyFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { DEFAULT_AVATAR_URL } from '../../../database/schema';

// Prefix key R2 untuk avatar upload user. S3-compatible storage tidak
// punya folder sungguhan -- ini murni bagian dari nama key (mis.
// "avatars/user-5-uuid.webp"), bukan direktori yang perlu di-mkdir.
const AVATAR_KEY_PREFIX = 'avatars';

// Default avatar TETAP di filesystem lokal container (bukan R2) -- lihat
// komentar panjang di configuration.ts kenapa: dia bundled asset yang
// ikut ter-build ke image Docker, bukan data user yang perlu persist
// lintas container recreate.
const DEFAULT_AVATAR_SUBDIR = 'avatars';
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
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.bucketName = this.configService.get<string>('r2.bucketName') as string;
    // Buang trailing slash kalau ada -- mencegah "//" ganda saat
    // digabung dengan key di saveAvatar()/deleteIfCustom().
    this.publicUrl = (
      this.configService.get<string>('r2.publicUrl') as string
    ).replace(/\/+$/, '');

    const accountId = this.configService.get<string>('r2.accountId') as string;

    this.s3Client = new S3Client({
      region: 'auto', // wajib secara struktural untuk S3Client, tidak dipakai R2 untuk routing
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.configService.get<string>('r2.accessKeyId') as string,
        secretAccessKey: this.configService.get<string>(
          'r2.secretAccessKey',
        ) as string,
      },
      // R2 belum mendukung algoritma checksum default yang diaktifkan
      // AWS SDK JS v3 sejak versi 3.729 (CRC32 otomatis di setiap
      // PutObject/UploadPart). Tanpa override ini, upload bisa gagal
      // dengan error "Header 'x-amz-checksum-crc32' ... not
      // implemented". WHEN_REQUIRED mengembalikan ke perilaku lama:
      // checksum cuma dihitung kalau operasi API benar-benar
      // mewajibkannya.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  private get defaultAvatarDir(): string {
    const uploadDir = this.configService.get<string>(
      'storage.uploadDir',
    ) as string;
    // process.cwd() = root project saat `node dist/main.js` dijalankan,
    // BUKAN __dirname (yang menunjuk ke dalam dist/) — folder ini harus
    // di luar dist supaya tidak ikut terhapus tiap `nest build`
    // (deleteOutDir).
    return join(process.cwd(), uploadDir, DEFAULT_AVATAR_SUBDIR);
  }

  /**
   * Dijalankan sekali saat aplikasi start: pastikan default avatar
   * BENAR-BENAR ada di disk lokal (bukan cuma string path di kolom
   * `avatar_url`), di-copy dari asset yang dibundel bersama source code
   * (lihat nest-cli.json `assets` config).
   *
   * CATATAN: ini TIDAK menyentuh R2 sama sekali -- object storage tidak
   * butuh "folder disiapkan" sebelum dipakai, key langsung ditulis saat
   * saveAvatar() dipanggil.
   */
  async onModuleInit(): Promise<void> {
    await mkdir(this.defaultAvatarDir, { recursive: true });

    const defaultAvatarPath = join(
      this.defaultAvatarDir,
      DEFAULT_AVATAR_FILENAME,
    );
    const alreadyExists = await this.fileExists(defaultAvatarPath);

    if (!alreadyExists) {
      // __dirname di runtime (dist/modules/profiles/storage) ->
      // ../assets/default-avatar.png (dist/modules/profiles/assets/...)
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
   * Kompres + upload avatar baru ke R2. Selalu dikonversi ke WebP
   * (format gambar modern dengan rasio kompresi terbaik) dan di-resize
   * ke ukuran persegi tetap — supaya file besar dari user (mis. foto HP
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
    const key = `${AVATAR_KEY_PREFIX}/${filename}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: compressed,
          ContentType: 'image/webp',
        }),
      );
    } catch (err) {
      // BEDA dengan error validasi di atas: kalau upload ke R2 gagal
      // (network, kredensial salah, bucket tidak ada, dst), ini BUKAN
      // kesalahan client -- biarkan mengalir sebagai 500 lewat
      // AllExceptionsFilter, jangan disamarkan jadi 415.
      this.logger.error(
        `Gagal upload avatar ke R2 (key "${key}"): ${String(err)}`,
      );
      throw err;
    }

    return `${this.publicUrl}/${key}`;
  }

  /**
   * Hapus object avatar lama dari R2 — dipanggil setelah avatar baru
   * berhasil disimpan, ATAU saat avatar direset ke default. TIDAK
   * PERNAH menghapus default avatar itu sendiri (dicek via URL match),
   * dan TIDAK menyentuh apapun yang bukan berasal dari bucket R2 ini.
   */
  async deleteIfCustom(avatarUrl: string | null): Promise<void> {
    if (!avatarUrl || avatarUrl === DEFAULT_AVATAR_URL) {
      return;
    }

    const prefix = `${this.publicUrl}/`;
    if (!avatarUrl.startsWith(prefix)) {
      // URL tidak berasal dari bucket R2 yang kita kelola (mis. data
      // lama dari sebelum migrasi, atau nilai yang di-tamper) — JANGAN
      // coba hapus sesuatu yang bukan tanggung jawab service ini.
      this.logger.warn(
        `URL avatar "${avatarUrl}" bukan berasal dari R2 bucket ini, dilewati.`,
      );
      return;
    }

    const key = avatarUrl.slice(prefix.length);

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }),
      );
    } catch (err) {
      // File sudah tidak ada / gagal dihapus -> log saja, jangan sampai
      // request user gagal gara-gara cleanup file lama tidak krusial.
      this.logger.warn(
        `Gagal menghapus avatar lama dari R2 (key "${key}"): ${String(err)}`,
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
