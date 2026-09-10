import { ConflictException, NotFoundException } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionsRepository } from './permissions.repository';
import { AuditLogService, AuditActor } from '../audit-log/audit-log.service';
import { PermissionsCacheService } from '../../core/authorization/permissions-cache.service';
import { AuthorizationRepository } from '../../core/authorization/authorization.repository';

const ACTOR: AuditActor = { userId: 99, email: 'admin@example.com' };

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
  const recordMock = jest.fn().mockResolvedValue(undefined);
  const auditLogService = { record: recordMock };
  const permissionsCache = {
    invalidateUser: jest.fn().mockResolvedValue(undefined),
    invalidateUsers: jest.fn().mockResolvedValue(undefined),
  };
  const authorizationRepository = {
    // Default [] supaya test yang tidak peduli soal fan-out
    // invalidation (create/update tanpa rename/dst) tidak perlu ikut
    // mock ini satu-satu.
    findUserIdsAffectedByPermission: jest.fn().mockResolvedValue([]),
  };

  const service = new PermissionsService(
    repo as unknown as PermissionsRepository,
    auditLogService as unknown as AuditLogService,
    permissionsCache as unknown as PermissionsCacheService,
    authorizationRepository as unknown as AuthorizationRepository,
  );
  return {
    service,
    repo,
    recordMock,
    permissionsCache,
    authorizationRepository,
  };
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

      await expect(
        service.create({ name: 'role:create' }, ACTOR),
      ).rejects.toThrow(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('membuat permission baru kalau nama belum dipakai', async () => {
      const { service, repo, recordMock } = createService();
      repo.findByName.mockResolvedValue(undefined);
      repo.create.mockResolvedValue(fakePermission());

      const result = await service.create({ name: 'role:create' }, ACTOR);

      expect(repo.create).toHaveBeenCalledWith({ name: 'role:create' });
      expect(result).toEqual(fakePermission());
      expect(recordMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'permission.create',
          actorUserId: 99,
        }),
      );
    });
  });

  describe('update', () => {
    it('menolak (via findByIdOrThrow) kalau permission tidak ada', async () => {
      const { service, repo } = createService();
      repo.findById.mockResolvedValue(undefined);

      await expect(service.update(1, { name: 'baru' }, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('menolak rename ke nama yang sudah dipakai permission LAIN', async () => {
      const { service, repo } = createService();
      repo.findById.mockResolvedValue(fakePermission({ id: 1 }));
      repo.findByName.mockResolvedValue(
        fakePermission({ id: 2, name: 'role:delete' }),
      );

      await expect(
        service.update(1, { name: 'role:delete' }, ACTOR),
      ).rejects.toThrow(ConflictException);
    });

    it('MENGIZINKAN update kalau "nama yang sudah dipakai" itu milik permission ini sendiri', async () => {
      const { service, repo } = createService();
      repo.findById.mockResolvedValue(fakePermission({ id: 1 }));
      repo.findByName.mockResolvedValue(fakePermission({ id: 1 }));
      repo.update.mockResolvedValue(fakePermission({ description: 'baru' }));

      await service.update(
        1,
        { name: 'role:create', description: 'baru' },
        ACTOR,
      );

      expect(repo.update).toHaveBeenCalledWith(1, {
        name: 'role:create',
        description: 'baru',
      });
    });

    it('tidak cek nama duplikat sama sekali kalau dto tidak mengubah nama', async () => {
      const { service, repo } = createService();
      repo.findById.mockResolvedValue(fakePermission());
      repo.update.mockResolvedValue(fakePermission({ description: 'x' }));

      await service.update(1, { description: 'x' }, ACTOR);

      expect(repo.findByName).not.toHaveBeenCalled();
    });

    it('TIDAK invalidate cache apapun kalau cuma ubah description (nama tidak berubah)', async () => {
      const { service, repo, permissionsCache, authorizationRepository } =
        createService();
      repo.findById.mockResolvedValue(fakePermission({ id: 1 }));
      repo.update.mockResolvedValue(
        fakePermission({ description: 'deskripsi baru' }),
      );

      await service.update(1, { description: 'deskripsi baru' }, ACTOR);

      expect(
        authorizationRepository.findUserIdsAffectedByPermission,
      ).not.toHaveBeenCalled();
      expect(permissionsCache.invalidateUsers).not.toHaveBeenCalled();
    });

    it('TIDAK invalidate cache kalau "rename" ternyata nilainya sama persis dengan nama lama (no-op)', async () => {
      const { service, repo, permissionsCache, authorizationRepository } =
        createService();
      repo.findById.mockResolvedValue(
        fakePermission({ id: 1, name: 'role:create' }),
      );
      repo.findByName.mockResolvedValue(
        fakePermission({ id: 1, name: 'role:create' }),
      );
      repo.update.mockResolvedValue(fakePermission({ name: 'role:create' }));

      await service.update(1, { name: 'role:create' }, ACTOR);

      expect(
        authorizationRepository.findUserIdsAffectedByPermission,
      ).not.toHaveBeenCalled();
      expect(permissionsCache.invalidateUsers).not.toHaveBeenCalled();
    });

    it('RENAME sungguhan: invalidate cache SEMUA user yang terdampak lewat role manapun', async () => {
      const { service, repo, permissionsCache, authorizationRepository } =
        createService();
      repo.findById.mockResolvedValue(
        fakePermission({ id: 1, name: 'role:create' }),
      );
      repo.findByName.mockResolvedValue(undefined);
      repo.update.mockResolvedValue(fakePermission({ name: 'role:make' }));
      authorizationRepository.findUserIdsAffectedByPermission.mockResolvedValue(
        [1, 2, 3],
      );

      await service.update(1, { name: 'role:make' }, ACTOR);

      expect(
        authorizationRepository.findUserIdsAffectedByPermission,
      ).toHaveBeenCalledWith(1);
      expect(permissionsCache.invalidateUsers).toHaveBeenCalledWith([1, 2, 3]);
    });
  });

  describe('delete', () => {
    it('menolak (via findByIdOrThrow) kalau permission tidak ada', async () => {
      const { service, repo } = createService();
      repo.findById.mockResolvedValue(undefined);

      await expect(service.delete(1, ACTOR)).rejects.toThrow(NotFoundException);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('menghapus permission kalau ditemukan & catat audit log', async () => {
      const { service, repo, recordMock } = createService();
      repo.findById.mockResolvedValue(fakePermission());

      await service.delete(1, ACTOR);

      expect(repo.delete).toHaveBeenCalledWith(1);
      expect(recordMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'permission.delete',
          actorUserId: 99,
        }),
      );
    });

    it('invalidate cache SEMUA user yang terdampak lintas SEMUA role yang punya permission ini', async () => {
      const { service, repo, permissionsCache, authorizationRepository } =
        createService();
      repo.findById.mockResolvedValue(fakePermission({ id: 1 }));
      authorizationRepository.findUserIdsAffectedByPermission.mockResolvedValue(
        [1, 2, 3, 4],
      );

      await service.delete(1, ACTOR);

      expect(
        authorizationRepository.findUserIdsAffectedByPermission,
      ).toHaveBeenCalledWith(1);
      expect(permissionsCache.invalidateUsers).toHaveBeenCalledWith([
        1, 2, 3, 4,
      ]);
    });

    it('mengambil daftar user terdampak SEBELUM memanggil repo.delete -- supaya tidak kena ON DELETE CASCADE duluan', async () => {
      const { service, repo, authorizationRepository } = createService();
      repo.findById.mockResolvedValue(fakePermission({ id: 1 }));

      await service.delete(1, ACTOR);

      const findCallOrder =
        authorizationRepository.findUserIdsAffectedByPermission.mock
          .invocationCallOrder[0];
      const deleteCallOrder = repo.delete.mock.invocationCallOrder[0];
      expect(findCallOrder).toBeLessThan(deleteCallOrder);
    });
  });
});
