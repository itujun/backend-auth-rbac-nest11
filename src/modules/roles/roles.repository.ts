import { Injectable } from '@nestjs/common';
import { asc, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { BaseRepository } from '../../core/repositories/base.repository';
import { roles } from '../../database/schema';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { FindRolesQueryDto } from './dto/find-roles-query.dto';
import { paginate, toOffset } from '../../common/utils/pagination.util';

const SORT_COLUMN_MAP = {
  name: roles.name,
  createdAt: roles.createdAt,
} as const;

@Injectable()
export class RolesRepository extends BaseRepository {
  findAll(query: FindRolesQueryDto) {
    const { page, limit, search, sortBy, sortOrder } = query;

    // `undefined` di sini berarti "tidak ada filter" — drizzle
    // memperbolehkan `where(undefined)` (artinya WHERE dilewati sama
    // sekali), jadi tidak perlu percabangan if/else terpisah.
    const whereClause: SQL | undefined = search
      ? or(
          ilike(roles.name, `%${search}%`),
          ilike(roles.description, `%${search}%`),
        )
      : undefined;

    const orderColumn = SORT_COLUMN_MAP[sortBy];
    const orderClause =
      sortOrder === 'desc' ? desc(orderColumn) : asc(orderColumn);

    const dataQuery = this.db.query.roles.findMany({
      where: whereClause,
      orderBy: orderClause,
      limit,
      offset: toOffset(page, limit),
    });

    const countQuery = this.db
      .select({ value: count() })
      .from(roles)
      .where(whereClause)
      .then((rows) => rows[0]?.value ?? 0);

    return paginate(dataQuery, countQuery, { page, limit });
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
