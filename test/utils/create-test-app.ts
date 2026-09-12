import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { Logger as PinoAppLogger, LoggerErrorInterceptor } from 'nestjs-pino';
import type Redis from 'ioredis';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import { REDIS_CLIENT } from '../../src/core/redis/redis.constants';

/**
 * Bootstrap Nest app untuk E2E test dengan pipe/filter/interceptor SAMA
 * PERSIS seperti main.ts (ValidationPipe, AllExceptionsFilter,
 * ResponseInterceptor, prefix /api) -- supaya yang dites benar-benar
 * merepresentasikan perilaku aplikasi asli. Tanpa ini, misalnya,
 * response body test tidak akan ke-bungkus { success, message, data }
 * seperti yang sebenarnya diterima client, dan validasi DTO
 * (whitelist/forbidNonWhitelisted) tidak ikut ke-tes.
 *
 * SENGAJA TIDAK meniru dari main.ts: helmet, app.enableCors(),
 * app.useStaticAssets(/uploads), app.enableShutdownHooks(), setupSwagger()
 * -- semua itu concern HTTP-server-level/browser yang tidak relevan untuk
 * supertest (manggil handler lewat HTTP internal, bukan lewat browser).
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
  });

  // Sama seperti Reflector di atas: PinoAppLogger diambil dari
  // `moduleFixture`, bukan `app`, karena alasan timing yang sama
  // (app belum ke-init).
  app.useLogger(moduleFixture.get(PinoAppLogger));
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(
    new LoggerErrorInterceptor(),
    // SENGAJA ambil dari `moduleFixture`, BUKAN `app.get(Reflector)` --
    // beda dengan main.ts (NestFactory.create() satu langkah, container
    // langsung ke-link penuh), di testing module container yang sudah
    // ter-link ada di `moduleFixture` (hasil .compile()). `app` (hasil
    // createNestApplication()) baru benar-benar siap resolve provider
    // SETELAH app.init() -- app.get() dipanggil sebelum itu akan gagal
    // dengan "this provider does not exist in the current context".
    new ResponseInterceptor(moduleFixture.get(Reflector)),
  );

  app.setGlobalPrefix('api');

  await app.init();
  return app;
}

/**
 * Tutup app hasil createTestApp() -- WAJIB dipakai di afterAll SEBAGAI
 * GANTI `app.close()` langsung.
 *
 * Kenapa tidak cukup `app.close()` saja: itu memicu
 * `RedisModule.onModuleDestroy()` yang manggil `client.quit()` --
 * graceful shutdown yang MENGASUMSIKAN koneksi pernah/sedang tersambung.
 * Di E2E ini Redis SENGAJA tidak dijalankan (lihat komentar di
 * global-setup.ts), jadi klien tidak pernah mencapai status 'ready' --
 * `quit()` dalam kondisi begini terbukti TIDAK membatalkan reconnect
 * timer ioredis (retryStrategy di RedisModule sengaja didesain tanpa
 * batas jumlah percobaan, itu benar untuk production tapi bikin proses
 * Jest menggantung terus di E2E). `disconnect()` memutus paksa +
 * membatalkan reconnect timer, dipanggil eksplisit SEBELUM app.close()
 * supaya tidak balapan dengan lifecycle shutdown NestJS.
 *
 * Efek samping yang DIHARAPKAN & tidak berbahaya: setelah ini, log
 * "ERROR: Error while closing Redis connection" dari
 * RedisModule.onModuleDestroy() akan tetap muncul sekali di akhir run --
 * itu karena onModuleDestroy tetap mencoba client.quit() pada koneksi
 * yang sudah kita putus paksa duluan di atas, lalu gagal & ke-log oleh
 * try/catch-nya sendiri. Bukan test gagal, bukan hang.
 */
export async function closeTestApp(app: INestApplication): Promise<void> {
  const redisClient = app.get<Redis>(REDIS_CLIENT);
  redisClient.disconnect();

  await app.close();
}
