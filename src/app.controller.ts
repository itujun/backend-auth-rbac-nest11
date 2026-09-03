import { Controller, Get } from '@nestjs/common';
import { ResponseMessage } from './common/decorators/response-message.decorator';

/**
 * Health check endpoint — GET /api/health
 * Berguna untuk load balancer / uptime monitor / sanity check setelah deploy.
 */
@Controller('health')
export class AppController {
  @Get()
  @ResponseMessage('Service is healthy')
  check() {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
