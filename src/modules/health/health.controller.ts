import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { DrizzleHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';

/**
 * GET /api/health — dipakai load balancer/uptime monitor/sanity check
 * setelah deploy. Mengembalikan 200 kalau semua indikator KRITIS "up",
 * 503 kalau ada satu saja yang "down" (perilaku bawaan
 * `HealthCheckService`).
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
    private readonly redisIndicator: RedisHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ResponseMessage('Health check OK')
  async check() {
    // Database HARUS masuk this.health.check() -- itu satu-satunya
    // agregator Terminus yang menentukan status code HTTP. DB down =
    // aplikasi benar-benar tidak bisa melayani request apapun = 503
    // memang perilaku yang benar.
    const result = await this.health.check([
      () => this.drizzleIndicator.isHealthy('database'),
    ]);

    // Redis SENGAJA dicek TERPISAH, di LUAR this.health.check(). Kalau
    // ikut dimasukkan ke array di atas, satu indicator "down" otomatis
    // bikin SELURUH endpoint balas 503 (perilaku default Terminus) --
    // itu bertentangan dengan filosofi RedisHealthIndicator sendiri:
    // Redis down TIDAK membuat aplikasi tidak bisa dipakai, karena
    // permission check tetap fallback ke query DB langsung (lihat
    // AuthorizationService, Phase 6b). Statusnya tetap disisipkan ke
    // response body untuk observability, tapi tidak ikut menentukan
    // HTTP status code endpoint ini -- supaya load balancer/orchestrator
    // (k8s dst) tidak salah kira aplikasi mati dan menariknya dari
    // rotasi traffic gara-gara cache yang sebenarnya optional.
    const redisCheck = await this.redisIndicator.isHealthy('redis');
    const isRedisUp = redisCheck.redis?.status === 'up';

    return {
      ...result,
      info: { ...result.info, ...(isRedisUp ? redisCheck : {}) },
      error: { ...result.error, ...(isRedisUp ? {} : redisCheck) },
      details: { ...result.details, ...redisCheck },
    };
  }
}
