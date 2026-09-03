import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // ConfigService bisa di-inject di module manapun tanpa import ulang
      load: [configuration],
      validate: validateEnv, // fail-fast kalau ada env wajib yang kosong/salah format
    }),
    DatabaseModule,
    // Feature modules (auth, profile, role, permission) akan didaftarkan
    // di sini satu per satu mulai Phase 1.
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
