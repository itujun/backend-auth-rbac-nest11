import { ConflictException, NotFoundException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesRepository } from './roles.repository';
import { RolePermissionsRepository } from './role-permissions.repository';
import { UserRolesRepository } from './user-roles.repository';
import { PermissionsService } from '../permissions/permissions.service';
import { UsersService } from '../users/users.service';
import { AuditLogService, AuditActor } from '../audit-log/audit-log.service';

const ACTOR: AuditActor = { userId: 99, email: 'admin@example.com' };

function fakeRole(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'editor',
    description: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function createService() {
  const rolesRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByName: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const rolePermissionsRepo = {
    listPermissionsForRole: jest.fn(),
    syncPermissions: jest.fn(),
  };
  const userRolesRepo = {
    listUsersForRole: jest.fn(),
    findAssignment: jest.fn(),
    assign: jest.fn(),
    revoke: jest.fn(),
  };
  const permissionsService = { findByIdOrThrow: jest.fn() };
  const usersService = { findById: jest.fn() };
  const recordMock = jest.fn().mockResolvedValue(undefined);
  const auditLogService = { record: recordMock };

  const service = new RolesService(
    rolesRepo as unknown as RolesRepository,
    rolePermissionsRepo as unknown as RolePermissionsRepository,
    userRolesRepo as unknown as UserRolesRepository,
    permissionsService as unknown as PermissionsService,
    usersService as unknown as UsersService,
    auditLogService as unknown as AuditLogService,
  );

  return {
    service,
    rolesRepo,
    rolePermissionsRepo,
    userRolesRepo,
    permissionsService,
    usersService,
    recordMock,
  };
}

describe('RolesService', () => {
  it('findAll() meneruskan query ke repository apa adanya', () => {
    const { service, rolesRepo } = createService();
    rolesRepo.findAll.mockReturnValue('hasil-paginasi');

    const result = service.findAll({ page: 1, limit: 10 } as never);

    expect(rolesRepo.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
    expect(result).toBe('hasil-paginasi');
  });

  describe('findByIdOrThrow', () => {
    it('melempar NotFoundException kalau role tidak ada', async () => {
      const { service, rolesRepo } = createService();
      rolesRepo.findById.mockResolvedValue(undefined);

      await expect(service.findByIdOrThrow(1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('mengembalikan role kalau ditemukan', async () => {
      const { service, rolesRepo } = createService();
      const role = fakeRole();
      rolesRepo.findById.mockResolvedValue(role);

      await expect(service.findByIdOrThrow(1)).resolves.toBe(role);
    });
  });

  describe('create', () => {
    it('menolak dengan ConflictException kalau nama role sudah dipakai', async () => {
      const { service, rolesRepo } = createService();
      rolesRepo.findByName.mockResolvedValue(fakeRole());

      await expect(service.create({ name: 'editor' }, ACTOR)).rejects.toThrow(
        ConflictException,
      );
      expect(rolesRepo.create).not.toHaveBeenCalled();
    });

    it('membuat role baru kalau nama belum dipakai', async () => {
      const { service, rolesRepo, recordMock } = createService();
      rolesRepo.findByName.mockResolvedValue(undefined);
      rolesRepo.create.mockResolvedValue(fakeRole());

      const result = await service.create({ name: 'editor' }, ACTOR);

      expect(rolesRepo.create).toHaveBeenCalledWith({ name: 'editor' });
      expect(result).toEqual(fakeRole());
      expect(recordMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'role.create', actorUserId: 99 }),
      );
    });
  });

  describe('update', () => {
    it('menolak (via findByIdOrThrow) kalau role tidak ada', async () => {
      const { service, rolesRepo } = createService();
      rolesRepo.findById.mockResolvedValue(undefined);

      await expect(service.update(1, { name: 'baru' }, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('menolak rename ke nama yang sudah dipakai role LAIN', async () => {
      const { service, rolesRepo } = createService();
      rolesRepo.findById.mockResolvedValue(fakeRole({ id: 1, name: 'editor' }));
      rolesRepo.findByName.mockResolvedValue(
        fakeRole({ id: 2, name: 'admin' }),
      );

      await expect(service.update(1, { name: 'admin' }, ACTOR)).rejects.toThrow(
        ConflictException,
      );
    });

    it('MENGIZINKAN update kalau "nama yang sudah dipakai" itu milik role ini sendiri (no-op rename)', async () => {
      const { service, rolesRepo } = createService();
      rolesRepo.findById.mockResolvedValue(fakeRole({ id: 1, name: 'editor' }));
      rolesRepo.findByName.mockResolvedValue(
        fakeRole({ id: 1, name: 'editor' }),
      );
      rolesRepo.update.mockResolvedValue(
        fakeRole({ id: 1, description: 'baru' }),
      );

      await service.update(1, { name: 'editor', description: 'baru' }, ACTOR);

      expect(rolesRepo.update).toHaveBeenCalledWith(1, {
        name: 'editor',
        description: 'baru',
      });
    });

    it('tidak cek nama duplikat sama sekali kalau dto tidak mengubah nama', async () => {
      const { service, rolesRepo } = createService();
      rolesRepo.findById.mockResolvedValue(fakeRole());
      rolesRepo.update.mockResolvedValue(
        fakeRole({ description: 'baru saja' }),
      );

      await service.update(1, { description: 'baru saja' }, ACTOR);

      expect(rolesRepo.findByName).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('menolak (via findByIdOrThrow) kalau role tidak ada', async () => {
      const { service, rolesRepo } = createService();
      rolesRepo.findById.mockResolvedValue(undefined);

      await expect(service.delete(1, ACTOR)).rejects.toThrow(NotFoundException);
      expect(rolesRepo.delete).not.toHaveBeenCalled();
    });

    it('menghapus role kalau ditemukan', async () => {
      const { service, rolesRepo, recordMock } = createService();
      rolesRepo.findById.mockResolvedValue(fakeRole());

      await service.delete(1, ACTOR);

      expect(rolesRepo.delete).toHaveBeenCalledWith(1);
      expect(recordMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'role.delete', actorUserId: 99 }),
      );
    });
  });

  describe('listPermissions', () => {
    it('memvalidasi role ada dulu, baru delegasikan ke rolePermissionsRepository', async () => {
      const { service, rolesRepo, rolePermissionsRepo } = createService();
      rolesRepo.findById.mockResolvedValue(fakeRole({ id: 1 }));
      rolePermissionsRepo.listPermissionsForRole.mockResolvedValue(['p1']);

      const result = await service.listPermissions(1);

      expect(rolePermissionsRepo.listPermissionsForRole).toHaveBeenCalledWith(
        1,
      );
      expect(result).toEqual(['p1']);
    });
  });

  describe('syncPermissions', () => {
    it('menolak kalau ada permissionId yang tidak valid, dan TIDAK sync sama sekali', async () => {
      const { service, rolesRepo, permissionsService, rolePermissionsRepo } =
        createService();
      rolesRepo.findById.mockResolvedValue(fakeRole({ id: 1 }));
      permissionsService.findByIdOrThrow.mockImplementation((id: number) =>
        id === 99
          ? Promise.reject(new NotFoundException())
          : Promise.resolve({}),
      );

      await expect(
        service.syncPermissions(1, { permissionIds: [1, 99] }, ACTOR),
      ).rejects.toThrow(NotFoundException);
      expect(rolePermissionsRepo.syncPermissions).not.toHaveBeenCalled();
    });

    it('memvalidasi SEMUA permissionId lalu sync, kembalikan daftar terbaru', async () => {
      const { service, rolesRepo, permissionsService, rolePermissionsRepo } =
        createService();
      rolesRepo.findById.mockResolvedValue(fakeRole({ id: 1 }));
      permissionsService.findByIdOrThrow.mockResolvedValue({});
      rolePermissionsRepo.listPermissionsForRole.mockResolvedValue([
        'p1',
        'p2',
      ]);

      const result = await service.syncPermissions(
        1,
        { permissionIds: [1, 2] },
        ACTOR,
      );

      expect(permissionsService.findByIdOrThrow).toHaveBeenCalledWith(1);
      expect(permissionsService.findByIdOrThrow).toHaveBeenCalledWith(2);
      expect(rolePermissionsRepo.syncPermissions).toHaveBeenCalledWith(
        1,
        [1, 2],
      );
      expect(result).toEqual(['p1', 'p2']);
    });
  });

  describe('listUsers', () => {
    it('memvalidasi role ada dulu, baru delegasikan ke userRolesRepository', async () => {
      const { service, rolesRepo, userRolesRepo } = createService();
      rolesRepo.findById.mockResolvedValue(fakeRole({ id: 1 }));
      userRolesRepo.listUsersForRole.mockResolvedValue(['u1']);

      const result = await service.listUsers(1);

      expect(userRolesRepo.listUsersForRole).toHaveBeenCalledWith(1);
      expect(result).toEqual(['u1']);
    });
  });

  describe('assignToUser', () => {
    it('menolak dengan NotFoundException kalau user tidak ada', async () => {
      const { service, rolesRepo, usersService } = createService();
      rolesRepo.findById.mockResolvedValue(fakeRole({ id: 1 }));
      usersService.findById.mockResolvedValue(undefined);

      await expect(service.assignToUser(1, 7, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('menolak dengan ConflictException kalau user sudah punya role ini', async () => {
      const { service, rolesRepo, usersService, userRolesRepo } =
        createService();
      rolesRepo.findById.mockResolvedValue(fakeRole({ id: 1 }));
      usersService.findById.mockResolvedValue({ id: 7 });
      userRolesRepo.findAssignment.mockResolvedValue({ userId: 7, roleId: 1 });

      await expect(service.assignToUser(1, 7, ACTOR)).rejects.toThrow(
        ConflictException,
      );
      expect(userRolesRepo.assign).not.toHaveBeenCalled();
    });

    it('assign sukses kalau role & user ada dan belum pernah di-assign', async () => {
      const { service, rolesRepo, usersService, userRolesRepo, recordMock } =
        createService();
      rolesRepo.findById.mockResolvedValue(fakeRole({ id: 1 }));
      usersService.findById.mockResolvedValue({ id: 7 });
      userRolesRepo.findAssignment.mockResolvedValue(undefined);

      await service.assignToUser(1, 7, ACTOR);

      expect(userRolesRepo.assign).toHaveBeenCalledWith(7, 1);
      expect(recordMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'role.assign_user' }),
      );
    });
  });

  describe('revokeFromUser', () => {
    it('menolak dengan NotFoundException kalau user tidak punya role ini', async () => {
      const { service, rolesRepo, userRolesRepo } = createService();
      rolesRepo.findById.mockResolvedValue(fakeRole({ id: 1 }));
      userRolesRepo.findAssignment.mockResolvedValue(undefined);

      await expect(service.revokeFromUser(1, 7, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
      expect(userRolesRepo.revoke).not.toHaveBeenCalled();
    });

    it('revoke sukses kalau assignment ditemukan', async () => {
      const { service, rolesRepo, userRolesRepo } = createService();
      rolesRepo.findById.mockResolvedValue(fakeRole({ id: 1 }));
      userRolesRepo.findAssignment.mockResolvedValue({ userId: 7, roleId: 1 });

      await service.revokeFromUser(1, 7, ACTOR);

      expect(userRolesRepo.revoke).toHaveBeenCalledWith(7, 1);
    });
  });
});
