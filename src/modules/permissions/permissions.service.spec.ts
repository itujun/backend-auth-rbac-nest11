import { ConflictException, NotFoundException } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionsRepository } from './permissions.repository';

function fakePermission(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'role:create',
    description: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function createService() {
  const repo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByName: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const service = new PermissionsService(
    repo as unknown as PermissionsRepository,
  );
  return { service, repo };
}

describe('PermissionsService', () => {
  it('findAll() meneruskan query ke repository apa adanya', () => {
    const { service, repo } = createService();
    repo.findAll.mockReturnValue('hasil-paginasi');

    const result = service.findAll({ page: 1, limit: 10 } as never);

    expect(repo.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
    expect(result).toBe('hasil-paginasi');
  });

  it('findByName() meneruskan nama ke repository apa adanya', () => {
    const { service, repo } = createService();
    repo.findByName.mockReturnValue('hasil');

    const result = service.findByName('role:create');

    expect(repo.findByName).toHaveBeenCalledWith('role:create');
    expect(result).toBe('hasil');
  });

  describe('findByIdOrThrow', () => {
    it('melempar NotFoundException kalau permission tidak ada', async () => {
      const { service, repo } = createService();
      repo.findById.mockResolvedValue(undefined);

      await expect(service.findByIdOrThrow(1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('mengembalikan permission kalau ditemukan', async () => {
      const { service, repo } = createService();
      const permission = fakePermission();
      repo.findById.mockResolvedValue(permission);

      await expect(service.findByIdOrThrow(1)).resolves.toBe(permission);
    });
  });

  describe('create', () => {
    it('menolak dengan ConflictException kalau nama sudah dipakai', async () => {
      const { service, repo } = createService();
      repo.findByName.mockResolvedValue(fakePermission());

      await expect(service.create({ name: 'role:create' })).rejects.toThrow(
        ConflictException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('membuat permission baru kalau nama belum dipakai', async () => {
      const { service, repo } = createService();
      repo.findByName.mockResolvedValue(undefined);
      repo.create.mockResolvedValue(fakePermission());

      const result = await service.create({ name: 'role:create' });

      expect(repo.create).toHaveBeenCalledWith({ name: 'role:create' });
      expect(result).toEqual(fakePermission());
    });
  });

  describe('update', () => {
    it('menolak (via findByIdOrThrow) kalau permission tidak ada', async () => {
      const { service, repo } = createService();
      repo.findById.mockResolvedValue(undefined);

      await expect(service.update(1, { name: 'baru' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('menolak rename ke nama yang sudah dipakai permission LAIN', async () => {
      const { service, repo } = createService();
      repo.findById.mockResolvedValue(fakePermission({ id: 1 }));
      repo.findByName.mockResolvedValue(
        fakePermission({ id: 2, name: 'role:delete' }),
      );

      await expect(service.update(1, { name: 'role:delete' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('MENGIZINKAN update kalau "nama yang sudah dipakai" itu milik permission ini sendiri', async () => {
      const { service, repo } = createService();
      repo.findById.mockResolvedValue(fakePermission({ id: 1 }));
      repo.findByName.mockResolvedValue(fakePermission({ id: 1 }));
      repo.update.mockResolvedValue(fakePermission({ description: 'baru' }));

      await service.update(1, {
        name: 'role:create',
        description: 'baru',
      });

      expect(repo.update).toHaveBeenCalledWith(1, {
        name: 'role:create',
        description: 'baru',
      });
    });

    it('tidak cek nama duplikat sama sekali kalau dto tidak mengubah nama', async () => {
      const { service, repo } = createService();
      repo.findById.mockResolvedValue(fakePermission());
      repo.update.mockResolvedValue(fakePermission({ description: 'x' }));

      await service.update(1, { description: 'x' });

      expect(repo.findByName).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('menolak (via findByIdOrThrow) kalau permission tidak ada', async () => {
      const { service, repo } = createService();
      repo.findById.mockResolvedValue(undefined);

      await expect(service.delete(1)).rejects.toThrow(NotFoundException);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('menghapus permission kalau ditemukan', async () => {
      const { service, repo } = createService();
      repo.findById.mockResolvedValue(fakePermission());

      await service.delete(1);

      expect(repo.delete).toHaveBeenCalledWith(1);
    });
  });
});
