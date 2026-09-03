import { Global, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DRIZZLE } from './database.constants';
import { schema } from './schema';

/**
 * @Global() supaya DRIZZLE provider tersedia di seluruh modul tanpa
 * perlu import DatabaseModule berulang-ulang di setiap feature module
 * (tetap sesuai DRY, tapi cukup di-import sekali di AppModule).
 */
@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('DatabaseModule');
        const connectionString = configService.get<string>('database.url');

        const pool = new Pool({ connectionString });

        pool.on('error', (err) => {
          // Error di idle client pool tidak boleh bikin proses crash diam-diam
          logger.error('Unexpected error on idle Postgres client', err);
        });

        logger.log('Postgres connection pool initialized');

        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnModuleDestroy {
  onModuleDestroy() {
    // Pool cleanup ditangani oleh proses shutdown Node/pg secara default;
    // ditinggalkan sebagai hook eksplisit kalau nanti perlu graceful close.
  }
}
