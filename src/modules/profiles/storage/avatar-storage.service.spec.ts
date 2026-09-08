import { UnsupportedMediaTypeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import * as fsPromises from 'node:fs/promises';
import sharp from 'sharp';
import { AvatarStorageService } from './avatar-storage.service';
import { DEFAULT_AVATAR_URL } from '../../../database/schema';

// Factory mock (bukan automock polos) supaya jest TIDAK perlu memuat
// binary native sharp/fs sungguhan sama sekali — service ini diuji murni
// dari sisi LOGIC (validasi, urutan panggilan, error mapping), bukan
// image processing atau file I/O sungguhan.
jest.mock('sharp', () => jest.fn());
jest.mock('node:fs/promises');

const mockedSharp = sharp as unknown as jest.Mock;
const mockedMkdir = fsPromises.mkdir as jest.Mock;
const mockedUnlink = fsPromises.unlink as jest.Mock;
const mockedAccess = fsPromises.access as jest.Mock;
const mockedCopyFile = fsPromises.copyFile as jest.Mock;

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
    toFile: jest.fn().mockResolvedValue(undefined),
  };
  chain.resize.mockReturnValue(chain);
  chain.webp.mockReturnValue(chain);
  return chain;
}

function createService(uploadDir = 'test-uploads') {
  const getMock = jest.fn().mockReturnValue(uploadDir);
  const configService = { get: getMock } as unknown as ConfigService;
  const service = new AvatarStorageService(configService);
  return { service };
}

describe('AvatarStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedMkdir.mockResolvedValue(undefined);
  });

  describe('saveAvatar', () => {
    const buffer = Buffer.from('fake-bytes');

    it('menolak Content-Type yang tidak didukung TANPA menyentuh sharp sama sekali', async () => {
      const { service } = createService();

      await expect(
        service.saveAvatar(buffer, 'application/pdf', 5),
      ).rejects.toThrow(UnsupportedMediaTypeException);
      expect(mockedSharp).not.toHaveBeenCalled();
    });

    it('menolak kalau sharp gagal membaca buffer sebagai gambar (corrupt/bukan gambar)', async () => {
      const { service } = createService();
      mockedSharp.mockReturnValue(createSharpChain({ metadataError: true }));

      await expect(service.saveAvatar(buffer, 'image/png', 5)).rejects.toThrow(
        UnsupportedMediaTypeException,
      );
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
    });

    it('menolak kalau decode penuh gagal walau metadata sempat lolos', async () => {
      const { service } = createService();
      mockedSharp.mockReturnValue(createSharpChain({ toBufferError: true }));

      await expect(service.saveAvatar(buffer, 'image/png', 5)).rejects.toThrow(
        UnsupportedMediaTypeException,
      );
    });

    it('sukses: kompres jadi WebP 512x512 & kembalikan URL dengan pola yang benar', async () => {
      const { service } = createService();
      const chain = createSharpChain({ metadata: { format: 'jpeg' } });
      mockedSharp.mockReturnValue(chain);

      const url = await service.saveAvatar(buffer, 'image/jpeg', 5);

      expect(chain.resize).toHaveBeenCalledWith(512, 512, { fit: 'cover' });
      expect(chain.webp).toHaveBeenCalledWith({ quality: 80 });
      expect(chain.toFile).toHaveBeenCalled();
      expect(url).toMatch(/^\/uploads\/avatars\/user-5-[0-9a-f-]{36}\.webp$/);
    });
  });

  describe('deleteIfCustom', () => {
    it('tidak melakukan apapun kalau avatarUrl null', async () => {
      const { service } = createService();

      await service.deleteIfCustom(null);

      expect(mockedUnlink).not.toHaveBeenCalled();
    });

    it('tidak pernah menghapus DEFAULT_AVATAR_URL', async () => {
      const { service } = createService();

      await service.deleteIfCustom(DEFAULT_AVATAR_URL);

      expect(mockedUnlink).not.toHaveBeenCalled();
    });

    it('menghapus file avatar custom sesuai nama filenya', async () => {
      const { service } = createService('test-uploads');
      mockedUnlink.mockResolvedValue(undefined);

      await service.deleteIfCustom('/uploads/avatars/user-5-abc.webp');

      const expectedPath = join(
        process.cwd(),
        'test-uploads',
        'avatars',
        'user-5-abc.webp',
      );
      expect(mockedUnlink).toHaveBeenCalledWith(expectedPath);
    });

    it('TIDAK melempar error kalau unlink gagal (file sudah tidak ada, dst) — cukup di-log', async () => {
      const { service } = createService();
      mockedUnlink.mockRejectedValue(new Error('ENOENT'));

      await expect(
        service.deleteIfCustom('/uploads/avatars/hilang.webp'),
      ).resolves.toBeUndefined();
    });
  });

  describe('onModuleInit', () => {
    it('selalu memastikan folder avatar ada', async () => {
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
