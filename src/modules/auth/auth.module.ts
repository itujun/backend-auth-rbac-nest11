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
import { RefreshTokensRepository } from './refresh-tokens/refresh-tokens.repository';
import { RefreshTokensService } from './refresh-tokens/refresh-tokens.service';
import { PasswordResetTokensRepository } from './password-reset-tokens/password-reset-tokens.repository';
import { PasswordResetTokensService } from './password-reset-tokens/password-reset-tokens.service';
import { EmailVerificationTokensRepository } from './email-verification-tokens/email-verification-tokens.repository';
import { EmailVerificationTokensService } from './email-verification-tokens/email-verification-tokens.service';
import { RefreshCookieHelper } from './utils/refresh-cookie.helper';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { TelegramModule } from '../telegram/telegram.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    UsersModule,
    HashingModule,
    AuditLogModule,
    TelegramModule,
    MailModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.accessSecret'),
        signOptions: {
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
    RefreshTokensRepository,
    RefreshTokensService,
    PasswordResetTokensRepository,
    PasswordResetTokensService,
    EmailVerificationTokensRepository,
    EmailVerificationTokensService,
    RefreshCookieHelper,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AuthModule {}
