import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleDb } from '../../../database/database.constants';

/**
 * @nestjs/terminus punya health indicator siap-pakai untuk TypeORM,
 * Mongoose, Sequelize, MikroORM, Prisma — tapi TIDAK untuk Drizzle.
 * Ini custom indicator mengikuti pola resmi `HealthIndicatorService`
 * (API baru terminus v10+, menggantikan `HealthIndicator` lama yang
 * sudah deprecated).
 */
@Injectable()
export class DrizzleHealthIndicator {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      // `SELECT 1` murni untuk verifikasi koneksi hidup — SENGAJA tidak
      // query tabel manapun, supaya health check tidak ikut terpengaruh
      // migrasi yang belum jalan atau tabel yang sengaja kosong.
      await this.db.execute(sql`SELECT 1`);
      return indicator.up();
    } catch (err) {
      return indicator.down({
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }
}
