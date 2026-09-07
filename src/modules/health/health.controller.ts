import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { DrizzleHealthIndicator } from './indicators/database.health';

/**
 * GET /api/health — dipakai load balancer/uptime monitor/sanity check
 * setelah deploy. Mengembalikan 200 kalau semua indikator "up", 503
 * kalau ada satu saja yang "down" (perilaku bawaan `HealthCheckService`).
 *
 * @Public() — harus bisa diakses tanpa login.
 * @SkipThrottle() — wajar dipanggil sangat sering oleh uptime monitor.
 * @ApiExcludeController() — bukan bagian "API bisnis" yang relevan
 * didokumentasikan ke konsumer API (auth/users/roles/dst) di Swagger.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly drizzleIndicator: DrizzleHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ResponseMessage('Health check OK')
  check() {
    return this.health.check([
      () => this.drizzleIndicator.isHealthy('database'),
    ]);
  }
}
