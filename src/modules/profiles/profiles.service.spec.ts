import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { ProfilesRepository } from './profiles.repository';
import { AvatarStorageService } from './storage/avatar-storage.service';
import { DEFAULT_AVATAR_URL } from '../../database/schema';

function fakeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 1,
    fullName: 'Budi Santoso',
    avatarUrl: DEFAULT_AVATAR_URL,
    phone: null,
    bio: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function createService() {
  const findByUserIdMock = jest.fn();
  const updateByUserIdMock = jest.fn();
  const updateAvatarUrlMock = jest.fn();
  const profilesRepository = {
    findByUserId: findByUserIdMock,
    updateByUserId: updateByUserIdMock,
    updateAvatarUrl: updateAvatarUrlMock,
  } as unknown as ProfilesRepository;

  const saveAvatarMock = jest.fn();
  const deleteIfCustomMock = jest.fn().mockResolvedValue(undefined);
  const avatarStorageService = {
    saveAvatar: saveAvatarMock,
    deleteIfCustom: deleteIfCustomMock,
  } as unknown as AvatarStorageService;

  const service = new ProfilesService(profilesRepository, avatarStorageService);

  return {
    service,
    findByUserIdMock,
    updateByUserIdMock,
    updateAvatarUrlMock,
    saveAvatarMock,
    deleteIfCustomMock,
  };
}

describe('ProfilesService', () => {
  describe('getByUserIdOrThrow', () => {
    it('mengembalikan profile kalau ditemukan', async () => {
      const { service, findByUserIdMock } = createService();
      const profile = fakeProfile();
      findByUserIdMock.mockResolvedValue(profile);

      await expect(service.getByUserIdOrThrow(1)).resolves.toBe(profile);
    });

    it('melempar NotFoundException kalau profile tidak ada (data tidak konsisten)', async () => {
      const { service, findByUserIdMock } = createService();
      findByUserIdMock.mockResolvedValue(undefined);

      await expect(service.getByUserIdOrThrow(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateOwn / updateByUserId', () => {
    it('update sukses kalau profile ada', async () => {
      const { service, findByUserIdMock, updateByUserIdMock } = createService();
      findByUserIdMock.mockResolvedValue(fakeProfile());
      updateByUserIdMock.mockResolvedValue(
        fakeProfile({ fullName: 'Nama Baru' }),
      );

      const result = await service.updateOwn(1, { fullName: 'Nama Baru' });

      expect(updateByUserIdMock).toHaveBeenCalledWith(1, {
        fullName: 'Nama Baru',
      });
      expect(result.fullName).toBe('Nama Baru');
    });

    it('menolak update kalau profile tidak ada (tidak pernah sampai query update)', async () => {
      const { service, findByUserIdMock, updateByUserIdMock } = createService();
      findByUserIdMock.mockResolvedValue(undefined);

      await expect(service.updateOwn(999, { fullName: 'x' })).rejects.toThrow(
        NotFoundException,
      );
      expect(updateByUserIdMock).not.toHaveBeenCalled();
    });

    it('updateByUserId() (endpoint admin) berperilaku identik dengan updateOwn()', async () => {
      const { service, findByUserIdMock, updateByUserIdMock } = createService();
      findByUserIdMock.mockResolvedValue(fakeProfile());
      updateByUserIdMock.mockResolvedValue(fakeProfile({ bio: 'Halo' }));

      const result = await service.updateByUserId(1, { bio: 'Halo' });

      expect(result.bio).toBe('Halo');
    });
  });

  describe('updateAvatar', () => {
    const fakeFile = {
      buffer: Buffer.from('fake-image-bytes'),
      mimetype: 'image/png',
    } as Express.Multer.File;

    it('menolak dengan BadRequestException kalau tidak ada file', async () => {
      const { service } = createService();

      await expect(service.updateAvatar(1, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('menolak dengan NotFoundException kalau profile tidak ada', async () => {
      const { service, findByUserIdMock, saveAvatarMock } = createService();
      findByUserIdMock.mockResolvedValue(undefined);

      await expect(service.updateAvatar(1, fakeFile)).rejects.toThrow(
        NotFoundException,
      );
      expect(saveAvatarMock).not.toHaveBeenCalled();
    });

    it('simpan avatar baru, update DB, BARU hapus avatar lama (urutan penting)', async () => {
      const {
        service,
        findByUserIdMock,
        updateAvatarUrlMock,
        saveAvatarMock,
        deleteIfCustomMock,
      } = createService();
      const callOrder: string[] = [];
      findByUserIdMock.mockResolvedValue(
        fakeProfile({ avatarUrl: '/uploads/avatars/user-1-old.webp' }),
      );
      saveAvatarMock.mockImplementation(() => {
        callOrder.push('saveAvatar');
        return Promise.resolve('/uploads/avatars/user-1-new.webp');
      });
      updateAvatarUrlMock.mockImplementation(() => {
        callOrder.push('updateAvatarUrl');
        return Promise.resolve(
          fakeProfile({ avatarUrl: '/uploads/avatars/user-1-new.webp' }),
        );
      });
      deleteIfCustomMock.mockImplementation(() => {
        callOrder.push('deleteIfCustom');
        return Promise.resolve();
      });

      await service.updateAvatar(1, fakeFile);

      expect(saveAvatarMock).toHaveBeenCalledWith(
        fakeFile.buffer,
        fakeFile.mimetype,
        1,
      );
      expect(deleteIfCustomMock).toHaveBeenCalledWith(
        '/uploads/avatars/user-1-old.webp',
      );
      // Kalau urutan kebalik (hapus dulu baru simpan/update DB), user
      // bisa berakhir TANPA avatar sama sekali kalau ada kegagalan di
      // tengah jalan — makanya urutan ini secara eksplisit dites.
      expect(callOrder).toEqual([
        'saveAvatar',
        'updateAvatarUrl',
        'deleteIfCustom',
      ]);
    });
  });

  describe('resetAvatar', () => {
    it('tidak memanggil deleteIfCustom kalau avatar SUDAH default', async () => {
      const {
        service,
        findByUserIdMock,
        deleteIfCustomMock,
        updateAvatarUrlMock,
      } = createService();
      findByUserIdMock.mockResolvedValue(
        fakeProfile({ avatarUrl: DEFAULT_AVATAR_URL }),
      );

      await service.resetAvatar(1);

      expect(deleteIfCustomMock).not.toHaveBeenCalled();
      expect(updateAvatarUrlMock).toHaveBeenCalledWith(1, DEFAULT_AVATAR_URL);
    });

    it('menghapus avatar lama kalau sebelumnya custom, lalu reset ke default', async () => {
      const {
        service,
        findByUserIdMock,
        deleteIfCustomMock,
        updateAvatarUrlMock,
      } = createService();
      findByUserIdMock.mockResolvedValue(
        fakeProfile({ avatarUrl: '/uploads/avatars/user-1-custom.webp' }),
      );

      await service.resetAvatar(1);

      expect(deleteIfCustomMock).toHaveBeenCalledWith(
        '/uploads/avatars/user-1-custom.webp',
      );
      expect(updateAvatarUrlMock).toHaveBeenCalledWith(1, DEFAULT_AVATAR_URL);
    });
  });
});
