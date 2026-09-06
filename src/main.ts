import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

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
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));

  app.setGlobalPrefix('api');

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
