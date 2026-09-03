import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { StringValue } from 'ms';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsersModule } from '../users/users.module';
import { HashingModule } from '../../core/hashing/hashing.module';

@Module({
  imports: [
    UsersModule,
    HashingModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.accessSecret'),
        signOptions: {
          // Cast ke StringValue (dari package `ms`): env var kita berupa
          // string seperti "15m"/"1h", @nestjs/jwt v11 mengetikkan
          // expiresIn secara ketat sebagai literal-pattern, bukan `string` biasa.
          expiresIn: configService.get<string>(
            'jwt.accessExpiresIn',
          ) as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // Didaftarkan sebagai APP_GUARD supaya berlaku GLOBAL ke semua route
    // di seluruh aplikasi (bukan cuma modul ini) — lihat penjelasan
    // "secure by default" di common/decorators/public.decorator.ts
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AuthModule {}
