import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { FindAuditLogsQueryDto } from './dto/find-audit-logs-query.dto';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ApiStandardResponse } from '../../common/swagger/api-standard-response.decorator';
import { SWAGGER_BEARER_AUTH_NAME } from '../../config/swagger.config';

@ApiTags('Audit Log')
@ApiBearerAuth(SWAGGER_BEARER_AUTH_NAME)
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @RequirePermission('audit_log:read')
  @ApiOperation({
    summary: 'Daftar audit log (pagination + filter)',
    description:
      'Filter tersedia: actorUserId, action (exact match, contoh ' +
      '"auth.login_failed"), resourceType. Endpoint ini TIDAK dicatat ' +
      'sebagai audit log-nya sendiri (read-only, tidak mengubah apapun).',
  })
  @ApiStandardResponse(AuditLogResponseDto, {
    paginated: true,
    description: 'Daftar audit log berhasil diambil',
  })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission audit-log:read',
  })
  @ResponseMessage('Daftar audit log berhasil diambil')
  findAll(@Query() query: FindAuditLogsQueryDto) {
    return this.auditLogService.findAll(query);
  }
}
