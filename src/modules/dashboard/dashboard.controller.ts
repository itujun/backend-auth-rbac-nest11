import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardSummaryResponseDto } from './dto/dashboard-summary-response.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ApiStandardResponse } from '../../common/swagger/api-standard-response.decorator';
import { SWAGGER_BEARER_AUTH_NAME } from '../../config/swagger.config';

@ApiTags('Dashboard')
@ApiBearerAuth(SWAGGER_BEARER_AUTH_NAME)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequirePermission('dashboard:read')
  @ApiOperation({
    summary:
      'Ringkasan statistik (user, role, permission, aktivitas audit log)',
    description:
      'Permission `dashboard:read` TERPISAH dari permission granular ' +
      'tiap resource (user:read, role:read, dst) -- satu permission ' +
      'ini cukup untuk melihat ANGKA agregat, tanpa perlu diberi akses ' +
      'ke data mentah masing-masing resource.',
  })
  @ApiStandardResponse(DashboardSummaryResponseDto, {
    description: 'Ringkasan dashboard berhasil diambil',
  })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission dashboard:read',
  })
  @ResponseMessage('Ringkasan dashboard berhasil diambil')
  getSummary() {
    return this.dashboardService.getSummary();
  }
}
