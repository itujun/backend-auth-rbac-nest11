import { UnsupportedMediaTypeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import * as fsPromises from 'node:fs/promises';
import sharp from 'sharp';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { AvatarStorageService } from './avatar-storage.service';
import { DEFAULT_AVATAR_URL } from '../../../database/schema';

// Factory mock (bukan automock polos) supaya jest TIDAK perlu memuat
// binary native sharp/fs sungguhan sama sekali — service ini diuji murni
// dari sisi LOGIC (validasi, urutan panggilan, error mapping), bukan
// image processing, file I/O, atau network call R2 sungguhan.
jest.mock('sharp', () => jest.fn());
jest.mock('node:fs/promises');

// mockSend didefinisikan di luar factory tapi TETAP bisa dipakai di
// dalamnya karena nama variabel diawali "mock" -- satu-satunya
// pengecualian yang diizinkan babel-plugin-jest-hoist untuk referensi
// out-of-scope di dalam jest.mock().
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
  DeleteObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
}));

const mockedSharp = sharp as unknown as jest.Mock;
const mockedMkdir = fsPromises.mkdir as jest.Mock;
const mockedAccess = fsPromises.access as jest.Mock;
const mockedCopyFile = fsPromises.copyFile as jest.Mock;
const mockedS3Client = S3Client as unknown as jest.Mock;
const mockedPutObjectCommand = PutObjectCommand as unknown as jest.Mock;
const mockedDeleteObjectCommand = DeleteObjectCommand as unknown as jest.Mock;

const TEST_BUCKET = 'test-bucket';
const TEST_PUBLIC_URL = 'https://pub-test.r2.dev';

interface SharpChainOptions {
  metadata?: { format?: string };
  metadataError?: boolean;
  toBufferError?: boolean;
}

/** Meniru chaining API sharp: `sharp(x).resize().webp().toBuffer()`. */
function createSharpChain(options: SharpChainOptions = {}) {
  const chain = {
    metadata: options.metadataError
      ? jest.fn().mockRejectedValue(new Error('bukan gambar'))
      : jest.fn().mockResolvedValue(options.metadata ?? { format: 'png' }),
    resize: jest.fn(),
    webp: jest.fn(),
    toBuffer: options.toBufferError
      ? jest.fn().mockRejectedValue(new Error('decode gagal'))
      : jest.fn().mockResolvedValue(Buffer.from('compressed-bytes')),
  };
  chain.resize.mockReturnValue(chain);
  chain.webp.mockReturnValue(chain);
  return chain;
}

function createService(
  overrides: Partial<{
    uploadDir: string;
    publicUrl: string;
  }> = {},
) {
  const config: Record<string, unknown> = {
    'storage.uploadDir': overrides.uploadDir ?? 'test-uploads',
    'r2.bucketName': TEST_BUCKET,
    'r2.publicUrl': overrides.publicUrl ?? TEST_PUBLIC_URL,
    'r2.accountId': 'test-account-id',
    'r2.accessKeyId': 'test-access-key',
    'r2.secretAccessKey': 'test-secret-key',
  };
  const getMock = jest.fn((key: string) => config[key]);
  const configService = { get: getMock } as unknown as ConfigService;
  const service = new AvatarStorageService(configService);
  return { service };
}

describe('AvatarStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedMkdir.mockResolvedValue(undefined);
  });

  describe('constructor', () => {
    it('membentuk endpoint R2 dari accountId & membuang trailing slash dari publicUrl', () => {
      createService({ publicUrl: 'https://pub-test.r2.dev/' });

      expect(mockedS3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'auto',
          endpoint: 'https://test-account-id.r2.cloudflarestorage.com',
        }),
      );
    });
  });

  describe('saveAvatar', () => {
    const buffer = Buffer.from('fake-bytes');

    it('menolak Content-Type yang tidak didukung TANPA menyentuh sharp atau R2 sama sekali', async () => {
      const { service } = createService();

      await expect(
        service.saveAvatar(buffer, 'application/pdf', 5),
      ).rejects.toThrow(UnsupportedMediaTypeException);
      expect(mockedSharp).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('menolak kalau sharp gagal membaca buffer sebagai gambar (corrupt/bukan gambar)', async () => {
      const { service } = createService();
      mockedSharp.mockReturnValue(createSharpChain({ metadataError: true }));

      await expect(service.saveAvatar(buffer, 'image/png', 5)).rejects.toThrow(
        UnsupportedMediaTypeException,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('mendeteksi MIME SPOOFING: Content-Type "image/png" tapi isi file sesungguhnya GIF', async () => {
      // Kasus bug nyata yang tercatat di README — klien bisa rename file
      // .gif jadi .png dan mengklaim Content-Type "image/png".
      const { service } = createService();
      mockedSharp.mockReturnValue(
        createSharpChain({ metadata: { format: 'gif' } }),
      );

      await expect(service.saveAvatar(buffer, 'image/png', 5)).rejects.toThrow(
        /terdeteksi sebagai "gif"/,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('menolak kalau decode penuh gagal walau metadata sempat lolos', async () => {
      const { service } = createService();
      mockedSharp.mockReturnValue(createSharpChain({ toBufferError: true }));

      await expect(service.saveAvatar(buffer, 'image/png', 5)).rejects.toThrow(
        UnsupportedMediaTypeException,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('sukses: kompres jadi WebP 512x512 & upload ke R2 dengan key + URL yang benar', async () => {
      const { service } = createService();
      const chain = createSharpChain({ metadata: { format: 'jpeg' } });
      mockedSharp.mockReturnValue(chain);
      mockSend.mockResolvedValue({});

      const url = await service.saveAvatar(buffer, 'image/jpeg', 5);

      expect(chain.resize).toHaveBeenCalledWith(512, 512, { fit: 'cover' });
      expect(chain.webp).toHaveBeenCalledWith({ quality: 80 });

      // Ekstrak argumen panggilan PutObjectCommand dulu (cast ini genuinely
      // perlu -- `.mock.calls` dari jest.fn() tanpa generic memang `any[]`,
      // BEDA dari kasus expect.stringMatching() sebelumnya yang castnya
      // ternyata redundant). Dengan begini tiap field diverifikasi lewat
      // pemanggilan assertion (toBe/toMatch), bukan lewat assignment
      // langsung ke property object literal -- menghindari bentrok antara
      // no-unsafe-assignment vs no-unnecessary-type-assertion.
      expect(mockedPutObjectCommand).toHaveBeenCalledTimes(1);
      const [putCallArgs] = mockedPutObjectCommand.mock.calls[0] as [
        { Bucket: string; Key: string; Body: Buffer; ContentType: string },
      ];
      expect(putCallArgs.Bucket).toBe(TEST_BUCKET);
      expect(putCallArgs.Key).toMatch(/^avatars\/user-5-[0-9a-f-]{36}\.webp$/);
      expect(putCallArgs.Body).toEqual(Buffer.from('compressed-bytes'));
      expect(putCallArgs.ContentType).toBe('image/webp');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(url).toMatch(
        new RegExp(`^${TEST_PUBLIC_URL}/avatars/user-5-[0-9a-f-]{36}\\.webp$`),
      );
    });

    it('BEDA dari error validasi: kegagalan upload R2 mengalir sebagai error asli (500), BUKAN disamarkan jadi UnsupportedMediaTypeException', async () => {
      const { service } = createService();
      mockedSharp.mockReturnValue(
        createSharpChain({ metadata: { format: 'jpeg' } }),
      );
      mockSend.mockRejectedValue(new Error('R2 tidak bisa dihubungi'));

      await expect(service.saveAvatar(buffer, 'image/jpeg', 5)).rejects.toThrow(
        'R2 tidak bisa dihubungi',
      );
    });
  });

  describe('deleteIfCustom', () => {
    it('tidak melakukan apapun kalau avatarUrl null', async () => {
      const { service } = createService();

      await service.deleteIfCustom(null);

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('tidak pernah menghapus DEFAULT_AVATAR_URL', async () => {
      const { service } = createService();

      await service.deleteIfCustom(DEFAULT_AVATAR_URL);

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('melewati (tidak menghapus) URL yang bukan berasal dari bucket R2 ini', async () => {
      const { service } = createService();

      await service.deleteIfCustom(
        'https://bucket-lain.example.com/avatars/user-5-abc.webp',
      );

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('menghapus object R2 sesuai key yang diekstrak dari URL', async () => {
      const { service } = createService();
      mockSend.mockResolvedValue({});

      await service.deleteIfCustom(
        `${TEST_PUBLIC_URL}/avatars/user-5-abc.webp`,
      );

      expect(mockedDeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: TEST_BUCKET,
        Key: 'avatars/user-5-abc.webp',
      });
    });

    it('TIDAK melempar error kalau delete R2 gagal (object sudah tidak ada, dst) — cukup di-log', async () => {
      const { service } = createService();
      mockSend.mockRejectedValue(new Error('NoSuchKey'));

      await expect(
        service.deleteIfCustom(`${TEST_PUBLIC_URL}/avatars/hilang.webp`),
      ).resolves.toBeUndefined();
    });
  });

  describe('onModuleInit', () => {
    it('selalu memastikan folder default avatar ada (lokal, bukan R2)', async () => {
      const { service } = createService();
      mockedAccess.mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(mockedMkdir).toHaveBeenCalledWith(
        expect.stringContaining(join('test-uploads', 'avatars')),
        { recursive: true },
      );
    });

    it('TIDAK copy default avatar kalau sudah ada di disk', async () => {
      const { service } = createService();
      mockedAccess.mockResolvedValue(undefined); // access sukses = file sudah ada

      await service.onModuleInit();

      expect(mockedCopyFile).not.toHaveBeenCalled();
    });

    it('copy default avatar dari bundled asset kalau belum ada di disk', async () => {
      const { service } = createService();
      mockedAccess.mockRejectedValue(new Error('ENOENT')); // belum ada

      await service.onModuleInit();

      expect(mockedCopyFile).toHaveBeenCalledWith(
        expect.stringContaining(join('assets', 'default-avatar.png')),
        expect.stringContaining('default.png'),
      );
    });
  });
});
