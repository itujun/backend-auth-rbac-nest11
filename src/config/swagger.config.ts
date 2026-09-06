import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Nama referensi security scheme, dipakai lagi di @ApiBearerAuth('access-token') per controller/route. */
export const SWAGGER_BEARER_AUTH_NAME = 'access-token';

/**
 * Dipanggil dari main.ts SETELAH setGlobalPrefix(). Path yang dipakai di
 * SwaggerModule.setup() di bawah SENGAJA ditulis literal 'api/docs'
 * (bukan cuma 'docs') — supaya konsisten terlihat sebagai bagian dari
 * '/api/*' walau sebenarnya middleware Swagger ini dipasang terpisah dari
 * prefix routing NestJS biasa.
 */
export function setupSwagger(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const enabled = configService.get<boolean>('app.swaggerEnabled');

  if (!enabled) {
    return;
  }

  const config = new DocumentBuilder()
    .setTitle('Auth & RBAC API')
    .setDescription(
      [
        'Backend latihan fundamental: JWT auth (access + refresh rotation), RBAC berbasis role & permission, upload+kompresi avatar, pagination/search/sort/filter.',
        '',
        '**Cara autentikasi di Swagger UI ini:**',
        '1. Panggil `POST /auth/register` lalu `POST /auth/login`.',
        '2. Salin `accessToken` dari response `login`.',
        '3. Klik tombol **Authorize** di kanan atas, tempel token (tanpa prefix "Bearer ").',
        '',
        'Catatan: `refreshToken` TIDAK dikirim di body — hanya lewat httpOnly cookie, jadi tidak bisa dicoba manual di sini. Endpoint `/auth/refresh` & `/auth/logout` tetap butuh cookie tersebut, jadi paling gampang dites lewat Postman/browser, bukan Swagger UI.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token dari /auth/login atau /auth/refresh',
      },
      SWAGGER_BEARER_AUTH_NAME,
    )
    .addTag('Auth', 'Registrasi, login, refresh & revoke token')
    .addTag('Users', 'Manajemen data user')
    .addTag('Profiles', 'Profil & avatar milik user')
    .addTag('Roles', 'Manajemen role')
    .addTag('Permissions', 'Manajemen permission')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // token tidak hilang tiap reload halaman Swagger UI
    },
  });

  new Logger('Bootstrap').log('Swagger docs tersedia di /api/docs');
}
