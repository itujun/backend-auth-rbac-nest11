import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import { ResponseMessage } from './common/decorators/response-message.decorator';
import { Public } from './common/decorators/public.decorator';

/**
 * Health check endpoint — GET /api/health
 * Berguna untuk load balancer / uptime monitor / sanity check setelah deploy.
 * @Public() karena health check harus bisa diakses tanpa login.
 * @SkipThrottle() karena endpoint ini WAJAR dipanggil sangat sering oleh
 * uptime monitor/load balancer — bukan trafik yang perlu dibatasi.
 * @ApiExcludeController() karena bukan bagian dari "API bisnis" yang
 * relevan didokumentasikan ke konsumer API (auth/users/roles/dst).
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('health')
export class AppController {
  @Public()
  @Get()
  @ResponseMessage('Service is healthy')
  check() {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
