import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { BaseRepository } from '../../core/repositories/base.repository';
import { roles } from '../../database/schema';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesRepository extends BaseRepository {
  findAll() {
    return this.db.query.roles.findMany({
      orderBy: asc(roles.name),
    });
  }

  findById(id: number) {
    return this.db.query.roles.findFirst({
      where: eq(roles.id, id),
    });
  }

  findByName(name: string) {
    return this.db.query.roles.findFirst({
      where: eq(roles.name, name),
    });
  }

  async create(input: CreateRoleDto) {
    const [row] = await this.db.insert(roles).values(input).returning();
    return row;
  }

  async update(id: number, input: UpdateRoleDto) {
    const [row] = await this.db
      .update(roles)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(roles.id, id))
      .returning();
    return row;
  }

  /**
   * Hard delete — sengaja tidak ada soft-delete untuk `roles` (sesuai
   * ERD, tidak ada kolom `deleted_at`). Row di `role_permissions` dan
   * `user_roles` yang mereferensikan role ini otomatis ikut terhapus
   * lewat `ON DELETE CASCADE` yang sudah didefinisikan di schema.
   */
  async delete(id: number): Promise<void> {
    await this.db.delete(roles).where(eq(roles.id, id));
  }
}
