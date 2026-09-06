import { Injectable } from '@nestjs/common';
import { asc, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { BaseRepository } from '../../core/repositories/base.repository';
import { permissions } from '../../database/schema';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { FindPermissionsQueryDto } from './dto/find-permissions-query.dto';
import { paginate, toOffset } from '../../common/utils/pagination.util';

const SORT_COLUMN_MAP = {
  name: permissions.name,
  createdAt: permissions.createdAt,
} as const;

@Injectable()
export class PermissionsRepository extends BaseRepository {
  findAll(query: FindPermissionsQueryDto) {
    const { page, limit, search, sortBy, sortOrder } = query;

    const whereClause: SQL | undefined = search
      ? or(
          ilike(permissions.name, `%${search}%`),
          ilike(permissions.description, `%${search}%`),
        )
      : undefined;

    const orderColumn = SORT_COLUMN_MAP[sortBy];
    const orderClause =
      sortOrder === 'desc' ? desc(orderColumn) : asc(orderColumn);

    const dataQuery = this.db.query.permissions.findMany({
      where: whereClause,
      orderBy: orderClause,
      limit,
      offset: toOffset(page, limit),
    });

    const countQuery = this.db
      .select({ value: count() })
      .from(permissions)
      .where(whereClause)
      .then((rows) => rows[0]?.value ?? 0);

    return paginate(dataQuery, countQuery, { page, limit });
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
