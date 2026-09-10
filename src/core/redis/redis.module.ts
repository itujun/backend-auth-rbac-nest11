import {
  Global,
  Inject,
  Logger,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * @Global() supaya REDIS_CLIENT provider tersedia di seluruh modul tanpa
 * perlu import RedisModule berulang-ulang di setiap feature module --
 * konsisten dengan pola DatabaseModule.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis => {
        const logger = new Logger('RedisModule');

        const client = new Redis({
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password'),
          db: configService.get<number>('redis.db'),
          keyPrefix: configService.get<string>('redis.keyPrefix'),

          // ==== FILOSOFI PALING PENTING DI FILE INI ====
          // Redis di project ini murni LAPISAN OPTIMASI (cache-aside),
          // BUKAN source of truth -- Postgres tetap satu-satunya sumber
          // kebenaran. Konsekuensinya: kalau Redis lambat/down, permission
          // check (Phase 6b) HARUS tetap bisa fallback ke query DB
          // langsung, bukan bikin request menggantung menunggu Redis
          // hidup lagi. Dua opsi di bawah ini yang memastikan itu:

          // Command yang gagal (mis. karena disconnect) HANYA di-retry
          // 1x sebelum melempar error ke pemanggil -- bukan retry
          // berkali-kali yang bikin request client menggantung lama.
          maxRetriesPerRequest: 1,

          // Kalau koneksi lagi putus, JANGAN antre command menunggu
          // reconnect (perilaku default ioredis) -- langsung lempar
          // error supaya caller (AuthorizationService di Phase 6b) bisa
          // fallback ke DB SEKETIKA, bukan ikut nunggu.
          enableOfflineQueue: false,

          // Backoff RECONNECT di level koneksi TCP (beda dari retry
          // command di atas) -- ini soal seberapa sering client coba
          // nyambung ulang ke server Redis di background, dibatasi
          // maksimal 5 detik antar percobaan supaya tidak spam.
          retryStrategy: (times: number) => Math.min(times * 200, 5000),
        });

        client.on('connect', () => {
          logger.log('Redis client connecting...');
        });

        client.on('ready', () => {
          logger.log('Redis client ready');
        });

        client.on('error', (err: Error) => {
          // WAJIB ada listener 'error' di sini -- ioredis adalah
          // EventEmitter Node biasa, dan Node MEMATIKAN PROSES kalau
          // event 'error' terlempar tanpa ada yang mendengarkan.
          // Cukup log, JANGAN throw -- Redis down tidak boleh ikut
          // menjatuhkan seluruh backend.
          logger.error(`Redis client error: ${err.message}`);
        });

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  private readonly logger = new Logger(RedisModule.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onModuleDestroy(): Promise<void> {
    try {
      // quit() -> kirim command QUIT, tunggu balasan, baru tutup socket.
      // Ini penutupan RAPI, beda dari disconnect() yang langsung putus
      // paksa. Konsisten dengan pool.end() di DatabaseModule. Hanya
      // benar-benar terpanggil karena app.enableShutdownHooks() sudah
      // diaktifkan di main.ts sejak fase logging & health check.
      await this.client.quit();
      this.logger.log('Redis connection closed gracefully');
    } catch (err) {
      this.logger.error('Error while closing Redis connection', err);
    }
  }
}
