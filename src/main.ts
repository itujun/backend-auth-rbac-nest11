import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { setupSwagger } from './config/swagger.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Helmet HARUS dipasang paling awal (sebelum middleware lain) — dia cuma
  // menambah response header keamanan, tidak butuh apapun dari request.
  //
  // Dua penyesuaian dari default Helmet, keduanya karena arsitektur app
  // ini SENGAJA cross-origin (frontend terpisah, avatar disajikan sebagai
  // static file):
  // 1. `contentSecurityPolicy: false` saat Swagger aktif — CSP default
  //    Helmet memblokir inline <script>/<style> yang dipakai Swagger UI
  //    (swagger-ui-express), bikin halaman /api/docs blank. Trade-off ini
  //    diterima karena Swagger sendiri sudah nonaktif otomatis di
  //    production (lihat `app.swaggerEnabled`).
  // 2. `crossOriginResourcePolicy: cross-origin` — default Helmet
  //    ('same-origin') akan DIBLOKIR BROWSER kalau frontend (origin
  //    berbeda, mis. localhost:5173) coba <img src="http://.../uploads/
  //    avatars/xxx.webp">. Endpoint ini memang didesain untuk diakses
  //    cross-origin (lihat app.useStaticAssets di bawah), sama seperti CDN.
  const swaggerEnabled = configService.get<boolean>('app.swaggerEnabled');
  app.use(
    helmet({
      contentSecurityPolicy: swaggerEnabled ? false : undefined,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(cookieParser());

  app.enableCors({
    origin: configService.get<string>('app.corsOrigin'),
    credentials: true, // wajib untuk kirim/terima httpOnly cookie (refresh token)
  });

  // Serve folder upload (avatar, dsb) sebagai static file di /uploads/*.
  // Path ini SENGAJA di luar prefix /api — ini akses file langsung
  // (seperti CDN), bukan endpoint JSON. Root folder pakai process.cwd()
  // (bukan __dirname) supaya konsisten dengan AvatarStorageService,
  // yang menyimpan file relatif dari root project juga.
  const uploadDir = configService.get<string>('storage.uploadDir') as string;
  app.useStaticAssets(join(process.cwd(), uploadDir), { prefix: '/uploads' });

  // Validasi otomatis semua DTO berdasarkan class-validator decorator.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // buang field yang tidak ada di DTO
      forbidNonWhitelisted: true, // tolak request kalau ada field asing
      transform: true, // auto-transform payload jadi instance DTO (+ tipe primitif)
      // enableImplicitConversion SENGAJA dimatikan (default: false).
      // Kalau diaktifkan, class-transformer melakukan konversi tipe
      // "implisit" berdasarkan reflected TypeScript type — untuk
      // boolean ini artinya `Boolean(value)`, yang SALAH untuk query
      // string: `Boolean("false")` hasilnya `true` (string non-kosong
      // selalu truthy di JS)! Ini bug nyata yang ketemu saat testing
      // Phase 5 (filter `?isActive=false` malah balik semua yang aktif).
      // Solusinya: semua konversi tipe query param HARUS eksplisit
      // lewat @Type()/@Transform() di DTO masing-masing (lihat
      // PaginationQueryDto, FindUsersQueryDto), bukan mengandalkan
      // "sihir" implicit conversion ini.
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));

  app.setGlobalPrefix('api');

  // Panggil SETELAH setGlobalPrefix supaya urutan bootstrap konsisten,
  // walau path Swagger UI di-set literal (lihat komentar di swagger.config.ts).
  setupSwagger(app);

  const port = configService.get<number>('app.port') ?? 3000;
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}/api`);
}

bootstrap().catch((err: unknown) => {
  // Kalau bootstrap gagal (mis. DB tidak bisa connect, env invalid),
  // pastikan proses exit dengan kode error, jangan silent hang.
  console.error('Failed to bootstrap application', err);
  process.exit(1);
});
