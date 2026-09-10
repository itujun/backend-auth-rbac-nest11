import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PermissionsRepository } from './permissions.repository';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { FindPermissionsQueryDto } from './dto/find-permissions-query.dto';
import { AuditLogService, AuditActor } from '../audit-log/audit-log.service';
import { PermissionsCacheService } from '../../core/authorization/permissions-cache.service';
import { AuthorizationRepository } from '../../core/authorization/authorization.repository';

@Injectable()
export class PermissionsService {
  constructor(
    private readonly permissionsRepository: PermissionsRepository,
    private readonly auditLogService: AuditLogService,
    private readonly permissionsCache: PermissionsCacheService,
    private readonly authorizationRepository: AuthorizationRepository,
  ) {}

  findAll(query: FindPermissionsQueryDto) {
    return this.permissionsRepository.findAll(query);
  }

  async findByIdOrThrow(id: number) {
    const permission = await this.permissionsRepository.findById(id);
    if (!permission) {
      throw new NotFoundException(`Permission dengan id ${id} tidak ditemukan`);
    }
    return permission;
  }

  findByName(name: string) {
    return this.permissionsRepository.findByName(name);
  }

  async create(dto: CreatePermissionDto, actor: AuditActor) {
    const existing = await this.permissionsRepository.findByName(dto.name);
    if (existing) {
      throw new ConflictException(`Permission "${dto.name}" sudah ada`);
    }
    const permission = await this.permissionsRepository.create(dto);

    await this.auditLogService.record({
      action: 'permission.create',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      resourceType: 'permission',
      resourceId: permission.id,
      metadata: { name: permission.name },
    });

    return permission;
  }

  async update(id: number, dto: UpdatePermissionDto, actor: AuditActor) {
    const current = await this.findByIdOrThrow(id);

    // Ditangkap SEBELUM update dijalankan, karena setelah update()
    // dipanggil `current.name` sudah tidak relevan lagi untuk
    // dibandingkan.
    const isRenaming = dto.name !== undefined && dto.name !== current.name;

    if (dto.name) {
      const existing = await this.permissionsRepository.findByName(dto.name);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Permission "${dto.name}" sudah ada`);
      }
    }

    const permission = await this.permissionsRepository.update(id, dto);

    await this.auditLogService.record({
      action: 'permission.update',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      resourceType: 'permission',
      resourceId: id,
      metadata: { changes: dto },
    });

    // Kasus yang gampang KELEWAT: cache permission menyimpan NAMA
    // (bukan ID) -- lihat AuthorizationRepository.findPermissionNamesByUserId().
    // Rename() terasa seperti operasi administratif biasa, padahal efek
    // ke cache-nya SAMA seperti mengubah definisi permission itu
    // sendiri: tanpa invalidation ini, semua user yang punya role
    // dengan permission ini akan terus melihat NAMA LAMA di cache
    // mereka sampai TTL habis. Ganti `description` saja TIDAK perlu
    // invalidation (tidak ikut disimpan di cache).
    if (isRenaming) {
      const affectedUserIds =
        await this.authorizationRepository.findUserIdsAffectedByPermission(id);
      await this.permissionsCache.invalidateUsers(affectedUserIds);
    }

    return permission;
  }

  async delete(id: number, actor: AuditActor): Promise<void> {
    const permission = await this.findByIdOrThrow(id);

    // HARUS diambil SEBELUM delete, dengan alasan yang sama seperti
    // RolesService.delete(): `ON DELETE CASCADE` di schema
    // role_permissions akan otomatis menghapus baris yang
    // mereferensikan permission ini begitu permission-nya dihapus.
    // Kalau diambil SESUDAH delete, query fan-out akan selalu
    // mengembalikan array kosong.
    const affectedUserIds =
      await this.authorizationRepository.findUserIdsAffectedByPermission(id);

    await this.permissionsRepository.delete(id);

    await this.auditLogService.record({
      action: 'permission.delete',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      resourceType: 'permission',
      resourceId: id,
      metadata: { name: permission.name },
    });

    // Kasus fan-out paling luas di seluruh sistem: satu permission bisa
    // dipakai banyak role sekaligus, dan tiap role itu bisa dipegang
    // banyak user sekaligus -- makanya query-nya di AuthorizationRepository
    // sengaja satu JOIN (role_permissions -> user_roles), bukan dua
    // round-trip terpisah.
    await this.permissionsCache.invalidateUsers(affectedUserIds);
  }
}
