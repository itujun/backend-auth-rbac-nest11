import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { Logger as PinoAppLogger, LoggerErrorInterceptor } from 'nestjs-pino';
import { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import { REDIS_CLIENT } from '../../src/core/redis/redis.constants';
import { TelegramService } from '../../src/modules/telegram/telegram.service';
import { MailService } from '../../src/modules/mail/mail.service';

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
  })
    // ThrottlerGuard didaftarkan GLOBAL lewat provider APP_GUARD (bukan
    // @UseGuards() di controller) -- makanya `overrideGuard(ThrottlerGuard)`
    // TIDAK bekerja di sini (overrideGuard cuma nyantol ke guard yang
    // di-resolve lewat reflection metadata @UseGuards(), bukan yang lewat
    // token APP_GUARD). Ada 3 guard di APP_GUARD (ThrottlerGuard di
    // AppModule, JwtAuthGuard di AuthModule, PermissionsGuard di
    // AuthorizationModule) -- override APP_GUARD langsung akan mematikan
    // KETIGANYA sekaligus (multi-provider di-replace total, bukan cuma
    // satu entri), padahal JwtAuthGuard/PermissionsGuard justru WAJIB
    // tetap jalan normal untuk test RBAC nanti.
    //
    // Solusi presisi: override `ThrottlerStorage` (provider internal yang
    // dipakai ThrottlerGuard untuk mencatat jumlah hit per key/route) jadi
    // storage palsu yang selalu lapor 0 hit -- ThrottlerGuard sendiri
    // TETAP terpasang & jalan normal, cuma tidak akan pernah menghitung
    // limit terlampaui. JwtAuthGuard/PermissionsGuard sama sekali tidak
    // tersentuh oleh override ini.
    .overrideProvider(ThrottlerStorage)
    .useValue({
      increment: () =>
        Promise.resolve({
          totalHits: 0,
          timeToExpire: 0,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
    })
    // AuthService.register() (dipanggil sungguhan oleh auth.e2e-spec.ts)
    // memanggil TelegramService.notifyAdmin() -- di-mock di sini supaya
    // E2E TIDAK melakukan HTTP call sungguhan ke api.telegram.org.
    // BEDA filosofi dengan Redis (yang sengaja DIBIARKAN gagal connect,
    // karena fallback-nya justru yang mau divalidasi): di sini tidak
    // ada assertion apapun yang menguji perilaku Telegram, jadi network
    // call sungguhan ke pihak ketiga cuma menambah risiko flaky/lambat
    // tanpa nilai tes sama sekali. TELEGRAM_BOT_TOKEN/TELEGRAM_ADMIN_CHAT_ID
    // di global-setup.ts tetap perlu dummy value (untuk lolos validasi
    // Joi saat boot), tapi effect-nya sudah dipotong total di sini.
    .overrideProvider(TelegramService)
    .useValue({
      notifyAdmin: jest.fn().mockResolvedValue(undefined),
    })
    // BEDA alasan dari TelegramService di atas: di sini MEMANG ada nilai
    // assertion (password-reset.e2e-spec.ts perlu membuktikan sendMail
    // TERPANGGIL untuk email terdaftar dan TIDAK terpanggil untuk email
    // yang tidak terdaftar -- itu inti dari perilaku anti-enumeration
    // yang mau dites). Kalau dibiarkan pakai MailService asli, setiap
    // test forgot-password akan mencoba konek ke localhost:1025 (default
    // dev) yang tidak ada di CI -- AuthService.forgotPassword() memang
    // menangkap error itu (tidak throw ke client, lihat komentar di
    // sana), TAPI itu berarti test tidak pernah benar-benar tahu apakah
    // pengiriman "seharusnya" terjadi atau tidak. `jest.fn()` di sini
    // dipakai test lewat `app.get(MailService)`, BUKAN cuma untuk
    // menghindari network call.
    .overrideProvider(MailService)
    .useValue({
      sendMail: jest.fn().mockResolvedValue(undefined),
    })
    .compile();

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
