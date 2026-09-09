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

@Injectable()
export class PermissionsService {
  constructor(
    private readonly permissionsRepository: PermissionsRepository,
    private readonly auditLogService: AuditLogService,
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
    await this.findByIdOrThrow(id);

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

    return permission;
  }

  async delete(id: number, actor: AuditActor): Promise<void> {
    const permission = await this.findByIdOrThrow(id);
    await this.permissionsRepository.delete(id);

    await this.auditLogService.record({
      action: 'permission.delete',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      resourceType: 'permission',
      resourceId: id,
      metadata: { name: permission.name },
    });
  }
}
