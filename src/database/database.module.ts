import {
  Global,
  Inject,
  Logger,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DRIZZLE, PG_POOL } from './database.constants';
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
      provide: PG_POOL,
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

        return pool;
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => drizzle(pool, { schema }),
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    // PENTING: method ini dulu ada tapi TIDAK PERNAH benar-benar
    // terpanggil — NestJS tidak menjalankan lifecycle shutdown hook
    // saat menerima sinyal OS (SIGTERM/SIGINT) kecuali
    // `app.enableShutdownHooks()` diaktifkan secara eksplisit. Itu baru
    // diaktifkan di main.ts pada tahap ini (Logging & Health Check).
    // Tanpa fix ini, tiap container di-restart (mis. deploy baru,
    // pod eviction di k8s) koneksi Postgres akan langsung terputus
    // paksa alih-alih ditutup rapi, berpotensi bikin query yang sedang
    // berjalan gagal di tengah jalan.
    try {
      await this.pool.end();
      this.logger.log('Postgres connection pool closed gracefully');
    } catch (err) {
      this.logger.error('Error while closing Postgres connection pool', err);
    }
  }
}
