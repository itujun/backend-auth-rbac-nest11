import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../core/repositories/base.repository';
import { auditLogs, type NewAuditLog } from '../../database/schema';

@Injectable()
export class AuditLogRepository extends BaseRepository {
  async create(input: NewAuditLog) {
    const [row] = await this.db.insert(auditLogs).values(input).returning();
    return row;
  }
}
