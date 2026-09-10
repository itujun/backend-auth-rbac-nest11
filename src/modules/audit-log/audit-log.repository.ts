import { Injectable } from '@nestjs/common';
import { and, desc, asc, count, eq, type SQL } from 'drizzle-orm';
import { BaseRepository } from '../../core/repositories/base.repository';
import { auditLogs, type NewAuditLog } from '../../database/schema';
import { FindAuditLogsQueryDto } from './dto/find-audit-logs-query.dto';
import { paginate, toOffset } from '../../common/utils/pagination.util';

@Injectable()
export class AuditLogRepository extends BaseRepository {
  findAll(query: FindAuditLogsQueryDto) {
    const { page, limit, actorUserId, action, resourceType, sortOrder } = query;

    const conditions: SQL[] = [];
    if (actorUserId !== undefined) {
      conditions.push(eq(auditLogs.actorUserId, actorUserId));
    }
    if (action) {
      conditions.push(eq(auditLogs.action, action));
    }
    if (resourceType) {
      conditions.push(eq(auditLogs.resourceType, resourceType));
    }
    const whereClause: SQL | undefined =
      conditions.length > 0 ? and(...conditions) : undefined;

    const orderClause =
      sortOrder === 'asc'
        ? asc(auditLogs.createdAt)
        : desc(auditLogs.createdAt);

    const dataQuery = this.db.query.auditLogs.findMany({
      where: whereClause,
      orderBy: orderClause,
      limit,
      offset: toOffset(page, limit),
    });

    const countQuery = this.db
      .select({ value: count() })
      .from(auditLogs)
      .where(whereClause)
      .then((rows) => rows[0]?.value ?? 0);

    return paginate(dataQuery, countQuery, { page, limit });
  }

  async create(input: NewAuditLog) {
    const [row] = await this.db.insert(auditLogs).values(input).returning();
    return row;
  }
}
