import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PermissionsRepository } from './permissions.repository';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { FindPermissionsQueryDto } from './dto/find-permissions-query.dto';

@Injectable()
export class PermissionsService {
  constructor(private readonly permissionsRepository: PermissionsRepository) {}

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

  async create(dto: CreatePermissionDto) {
    const existing = await this.permissionsRepository.findByName(dto.name);
    if (existing) {
      throw new ConflictException(`Permission "${dto.name}" sudah ada`);
    }
    return this.permissionsRepository.create(dto);
  }

  async update(id: number, dto: UpdatePermissionDto) {
    await this.findByIdOrThrow(id);

    if (dto.name) {
      const existing = await this.permissionsRepository.findByName(dto.name);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Permission "${dto.name}" sudah ada`);
      }
    }

    return this.permissionsRepository.update(id, dto);
  }

  async delete(id: number): Promise<void> {
    await this.findByIdOrThrow(id);
    await this.permissionsRepository.delete(id);
  }
}
