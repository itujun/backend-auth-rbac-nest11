import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { createLoggerOptions } from './config/logger.config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthorizationModule } from './core/authorization/authorization.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { RolesModule } from './modules/roles/roles.module';
import { ProfilesModule } from './modules/profiles/profiles.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // ConfigService bisa di-inject di module manapun tanpa import ulang
      load: [configuration],
      validate: validateEnv, // fail-fast kalau ada env wajib yang kosong/salah format
    }),
    // LoggerModule HARUS diimpor cuma SEKALI di root module (peringatan
    // resmi nestjs-pino) — dia @Global(), jadi Logger/PinoLogger otomatis
    // tersedia di modul manapun tanpa import ulang. Import ulang di modul
    // lain akan memasang middleware pino-http DUA KALI (tiap request
    // ter-log dobel) tanpa error apapun yang kelihatan.
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createLoggerOptions,
    }),
    // Didaftarkan SEBELUM module lain (lihat providers[] di bawah juga) —
    // rate limiting harus jadi lapisan PALING LUAR, jalan sebelum
    // JwtAuthGuard/PermissionsGuard. Kalau kebalik, request yang sudah
    // kena reject 401/403 tetap ikut menghabiskan kuota autentikasi yang
    // sebenarnya lebih mahal (query DB), padahal harusnya sudah ditolak
    // duluan di layer rate limit yang jauh lebih murah.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: configService.get<number>('throttle.ttlMs') as number,
            limit: configService.get<number>('throttle.limit') as number,
          },
        ],
      }),
    }),
    DatabaseModule,
    HealthModule,
    AuditLogModule,
    // URUTAN IMPORT INI PENTING: NestJS menjalankan beberapa provider
    // APP_GUARD sesuai urutan modul di-resolve. AuthModule (JwtAuthGuard,
    // yang mengisi `request.user`) HARUS di-import SEBELUM
    // AuthorizationModule (PermissionsGuard, yang MEMBACA `request.user`).
    // Kalau kebalik, PermissionsGuard jalan duluan dan selalu menolak
    // dengan "User tidak terautentikasi" walau token valid — pernah
    // benar-benar kejadian saat testing Phase 3, lihat README.
    UsersModule,
    AuthModule,
    AuthorizationModule,
    PermissionsModule,
    RolesModule,
    ProfilesModule,
  ],
  providers: [
    // Guard global PERTAMA yang jalan (lihat komentar ThrottlerModule di
    // atas) — didaftarkan di root AppModule, bukan di dalam modul lain,
    // supaya urutannya predictable dan tidak bergantung urutan import.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
