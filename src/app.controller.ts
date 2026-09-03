import { Controller, Get } from '@nestjs/common';
import { ResponseMessage } from './common/decorators/response-message.decorator';
import { Public } from './common/decorators/public.decorator';

/**
 * Health check endpoint — GET /api/health
 * Berguna untuk load balancer / uptime monitor / sanity check setelah deploy.
 * @Public() karena health check harus bisa diakses tanpa login.
 */
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
