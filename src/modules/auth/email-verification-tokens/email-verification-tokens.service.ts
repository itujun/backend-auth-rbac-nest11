import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import ms from 'ms';
import type { StringValue } from 'ms';
import { EmailVerificationTokensRepository } from './email-verification-tokens.repository';
import { hashToken } from '../utils/hash-token.util';

export interface IssuedEmailVerificationToken {
  rawToken: string;
  expiresAt: Date;
}

/**
 * Struktur & alasan desain identik PasswordResetTokensService (token
 * random 32 byte, hash tersimpan bukan mentahnya, invalidate-lalu-issue,
 * consume atomik) -- satu-satunya beda praktis adalah default umur
 * token (24 jam, bukan 30 menit) karena verifikasi email bukan
 * operasi sensitif keamanan seperti reset password, cuma konfirmasi
 * kepemilikan alamat email.
 */
@Injectable()
export class EmailVerificationTokensService {
  constructor(
    private readonly emailVerificationTokensRepository: EmailVerificationTokensRepository,
    private readonly configService: ConfigService,
  ) {}

  async issue(userId: number): Promise<IssuedEmailVerificationToken> {
    await this.emailVerificationTokensRepository.invalidateAllForUser(userId);

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    const expiresInStr = this.configService.get<string>(
      'emailVerification.tokenExpiresIn',
    ) as StringValue;
    const expiresAt = new Date(Date.now() + ms(expiresInStr));

    const row = await this.emailVerificationTokensRepository.create({
      userId,
      tokenHash,
      expiresAt,
    });

    return { rawToken, expiresAt: row.expiresAt };
  }

  async consume(rawToken: string): Promise<{ userId: number } | null> {
    const tokenHash = hashToken(rawToken);
    const row = await this.emailVerificationTokensRepository.consume(tokenHash);
    return row ? { userId: row.userId } : null;
  }
}
