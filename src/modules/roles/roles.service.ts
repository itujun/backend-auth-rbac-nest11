import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RolesRepository } from './roles.repository';
import { RolePermissionsRepository } from './role-permissions.repository';
import { UserRolesRepository } from './user-roles.repository';
import { PermissionsService } from '../permissions/permissions.service';
import { UsersService } from '../users/users.service';
import { PermissionsCacheService } from '../../core/authorization/permissions-cache.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SyncRolePermissionsDto } from './dto/sync-role-permissions.dto';
import { FindRolesQueryDto } from './dto/find-roles-query.dto';
import { AuditLogService, AuditActor } from '../audit-log/audit-log.service';

@Injectable()
export class RolesService {
  constructor(
    private readonly rolesRepository: RolesRepository,
    private readonly rolePermissionsRepository: RolePermissionsRepository,
    private readonly userRolesRepository: UserRolesRepository,
    private readonly permissionsService: PermissionsService,
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
    private readonly permissionsCache: PermissionsCacheService,
  ) {}

  findAll(query: FindRolesQueryDto) {
    return this.rolesRepository.findAll(query);
  }

  async findByIdOrThrow(id: number) {
    const role = await this.rolesRepository.findById(id);
    if (!role) {
      throw new NotFoundException(`Role dengan id ${id} tidak ditemukan`);
    }
    return role;
  }

  async create(dto: CreateRoleDto, actor: AuditActor) {
    const existing = await this.rolesRepository.findByName(dto.name);
    if (existing) {
      throw new ConflictException(`Role "${dto.name}" sudah ada`);
    }
    const role = await this.rolesRepository.create(dto);

    await this.auditLogService.record({
      action: 'role.create',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      resourceType: 'role',
      resourceId: role.id,
      metadata: { name: role.name },
    });

    return role;
  }

  async update(id: number, dto: UpdateRoleDto, actor: AuditActor) {
    await this.findByIdOrThrow(id);

    if (dto.name) {
      const existing = await this.rolesRepository.findByName(dto.name);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Role "${dto.name}" sudah ada`);
      }
    }

    const role = await this.rolesRepository.update(id, dto);

    await this.auditLogService.record({
      action: 'role.update',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      resourceType: 'role',
      resourceId: id,
      metadata: { changes: dto },
    });

    return role;
  }

  async delete(id: number, actor: AuditActor): Promise<void> {
    const role = await this.findByIdOrThrow(id);

    // HARUS diambil SEBELUM delete, bukan sesudah. `ON DELETE CASCADE`
    // di schema `user_roles` akan otomatis menghapus baris-baris yang
    // mereferensikan role ini begitu role-nya dihapus -- kalau daftar
    // user ini diambil SESUDAH delete, query-nya cuma akan
    // mengembalikan array kosong (karena baris relasinya sudah lenyap),
    // dan tidak ada user yang benar-benar ter-invalidate cache-nya.
    const affectedUsers = await this.userRolesRepository.listUsersForRole(id);

    await this.rolesRepository.delete(id);

    await this.auditLogService.record({
      action: 'role.delete',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      resourceType: 'role',
      resourceId: id,
      metadata: { name: role.name },
    });

    await this.permissionsCache.invalidateUsers(
      affectedUsers.map((user) => user.id),
    );
  }

  async listPermissions(roleId: number) {
    await this.findByIdOrThrow(roleId);
    return this.rolePermissionsRepository.listPermissionsForRole(roleId);
  }

  async syncPermissions(
    roleId: number,
    dto: SyncRolePermissionsDto,
    actor: AuditActor,
  ) {
    await this.findByIdOrThrow(roleId);

    // Validasi SEMUA permissionId yang dikirim benar-benar ada, sebelum
    // sync dijalankan — supaya tidak ada "permission hantu" ter-assign
    // gara-gara ID asal ketik/typo dari client.
    await Promise.all(
      dto.permissionIds.map((permissionId) =>
        this.permissionsService.findByIdOrThrow(permissionId),
      ),
    );

    await this.rolePermissionsRepository.syncPermissions(
      roleId,
      dto.permissionIds,
    );

    await this.auditLogService.record({
      action: 'role.sync_permissions',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      resourceType: 'role',
      resourceId: roleId,
      metadata: { permissionIds: dto.permissionIds },
    });

    // Sync permission SATU role berdampak ke SEMUA user yang memegang
    // role itu -- bukan cuma satu user seperti assign/revoke. Diambil
    // SESUDAH sync (bukan sebelum) tidak masalah di sini, karena
    // sync_permissions cuma mengubah baris `role_permissions`, sama
    // sekali tidak menyentuh `user_roles` -- daftar siapa saja pemegang
    // role ini tidak berubah akibat operasi ini.
    const affectedUsers =
      await this.userRolesRepository.listUsersForRole(roleId);
    await this.permissionsCache.invalidateUsers(
      affectedUsers.map((user) => user.id),
    );

    return this.rolePermissionsRepository.listPermissionsForRole(roleId);
  }

  async listUsers(roleId: number) {
    await this.findByIdOrThrow(roleId);
    return this.userRolesRepository.listUsersForRole(roleId);
  }

  async assignToUser(roleId: number, userId: number, actor: AuditActor) {
    await this.findByIdOrThrow(roleId);

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException(`User dengan id ${userId} tidak ditemukan`);
    }

    const existing = await this.userRolesRepository.findAssignment(
      userId,
      roleId,
    );
    if (existing) {
      throw new ConflictException('User sudah memiliki role ini');
    }

    await this.userRolesRepository.assign(userId, roleId);

    await this.auditLogService.record({
      action: 'role.assign_user',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      resourceType: 'user_role',
      resourceId: `${roleId}:${userId}`,
      metadata: { roleId, userId },
    });

    // Dampak assign HANYA ke satu user ini -- tidak perlu fan-out
    // query seperti syncPermissions, cukup invalidate satu key.
    await this.permissionsCache.invalidateUser(userId);
  }

  async revokeFromUser(
    roleId: number,
    userId: number,
    actor: AuditActor,
  ): Promise<void> {
    await this.findByIdOrThrow(roleId);

    const existing = await this.userRolesRepository.findAssignment(
      userId,
      roleId,
    );
    if (!existing) {
      throw new NotFoundException('User tidak memiliki role ini');
    }

    await this.userRolesRepository.revoke(userId, roleId);

    await this.auditLogService.record({
      action: 'role.revoke_user',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      resourceType: 'user_role',
      resourceId: `${roleId}:${userId}`,
      metadata: { roleId, userId },
    });

    // Titik PALING kritis dari semua invalidation di file ini: kalau
    // ini gagal diam-diam, user yang HARUSNYA sudah kehilangan akses
    // tetap bisa memakai permission lama sampai TTL cache habis (lihat
    // PermissionsCacheService.invalidateUser -- makanya kegagalan di
    // situ di-log sebagai ERROR, bukan WARN).
    await this.permissionsCache.invalidateUser(userId);
  }
}
