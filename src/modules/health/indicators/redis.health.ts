import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../core/redis/redis.constants';

/**
 * Berbeda dari DrizzleHealthIndicator: Redis DOWN tidak berarti aplikasi
 * tidak bisa dipakai sama sekali (permission check tetap fallback ke DB,
 * lihat AuthorizationService). Redis tetap disertakan di /api/health
 * (bukan berarti "app mati", tapi "cache tidak optimal, ada yang perlu
 * dicek") -- ini keputusan sadar demi observability: tim ops perlu tahu
 * secepatnya kalau Redis bermasalah, walau user akhir belum kerasa
 * dampaknya (baru kerasa kalau trafik naik dan DB mulai keteteran tanpa
 * cache).
 */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      await this.redis.ping();
      return indicator.up();
    } catch (err) {
      return indicator.down({
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }
}
