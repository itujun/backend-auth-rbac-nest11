import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { BaseRepository } from '../../core/repositories/base.repository';
import { permissions } from '../../database/schema';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Injectable()
export class PermissionsRepository extends BaseRepository {
  findAll() {
    return this.db.query.permissions.findMany({
      orderBy: asc(permissions.name),
    });
  }

  findById(id: number) {
    return this.db.query.permissions.findFirst({
      where: eq(permissions.id, id),
    });
  }

  findByName(name: string) {
    return this.db.query.permissions.findFirst({
      where: eq(permissions.name, name),
    });
  }

  async create(input: CreatePermissionDto) {
    const [row] = await this.db.insert(permissions).values(input).returning();
    return row;
  }

  async update(id: number, input: UpdatePermissionDto) {
    const [row] = await this.db
      .update(permissions)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(permissions.id, id))
      .returning();
    return row;
  }

  async delete(id: number): Promise<void> {
    await this.db.delete(permissions).where(eq(permissions.id, id));
  }
}
