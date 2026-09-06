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
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SyncRolePermissionsDto } from './dto/sync-role-permissions.dto';
import { FindRolesQueryDto } from './dto/find-roles-query.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly rolesRepository: RolesRepository,
    private readonly rolePermissionsRepository: RolePermissionsRepository,
    private readonly userRolesRepository: UserRolesRepository,
    private readonly permissionsService: PermissionsService,
    private readonly usersService: UsersService,
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

  async create(dto: CreateRoleDto) {
    const existing = await this.rolesRepository.findByName(dto.name);
    if (existing) {
      throw new ConflictException(`Role "${dto.name}" sudah ada`);
    }
    return this.rolesRepository.create(dto);
  }

  async update(id: number, dto: UpdateRoleDto) {
    await this.findByIdOrThrow(id);

    if (dto.name) {
      const existing = await this.rolesRepository.findByName(dto.name);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Role "${dto.name}" sudah ada`);
      }
    }

    return this.rolesRepository.update(id, dto);
  }

  async delete(id: number): Promise<void> {
    await this.findByIdOrThrow(id);
    await this.rolesRepository.delete(id);
  }

  async listPermissions(roleId: number) {
    await this.findByIdOrThrow(roleId);
    return this.rolePermissionsRepository.listPermissionsForRole(roleId);
  }

  async syncPermissions(roleId: number, dto: SyncRolePermissionsDto) {
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

    return this.rolePermissionsRepository.listPermissionsForRole(roleId);
  }

  async listUsers(roleId: number) {
    await this.findByIdOrThrow(roleId);
    return this.userRolesRepository.listUsersForRole(roleId);
  }

  async assignToUser(roleId: number, userId: number) {
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
  }

  async revokeFromUser(roleId: number, userId: number): Promise<void> {
    await this.findByIdOrThrow(roleId);

    const existing = await this.userRolesRepository.findAssignment(
      userId,
      roleId,
    );
    if (!existing) {
      throw new NotFoundException('User tidak memiliki role ini');
    }

    await this.userRolesRepository.revoke(userId, roleId);
  }
}
