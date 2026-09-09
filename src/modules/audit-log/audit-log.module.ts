import { Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditLogRepository } from './audit-log.repository';

@Module({
  providers: [AuditLogService, AuditLogRepository],
  exports: [AuditLogService],
})
export class AuditLogModule {}
