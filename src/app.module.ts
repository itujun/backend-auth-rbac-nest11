import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthorizationModule } from './core/authorization/authorization.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { RolesModule } from './modules/roles/roles.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // ConfigService bisa di-inject di module manapun tanpa import ulang
      load: [configuration],
      validate: validateEnv, // fail-fast kalau ada env wajib yang kosong/salah format
    }),
    DatabaseModule,
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
    // Feature module (profile) akan didaftarkan mulai Phase 4.
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
