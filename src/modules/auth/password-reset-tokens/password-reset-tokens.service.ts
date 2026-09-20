import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import ms from 'ms';
import type { StringValue } from 'ms';
import { PasswordResetTokensRepository } from './password-reset-tokens.repository';
import { hashToken } from '../utils/hash-token.util';

export interface IssuedPasswordResetToken {
  rawToken: string;
  expiresAt: Date;
}

@Injectable()
export class PasswordResetTokensService {
  constructor(
    private readonly passwordResetTokensRepository: PasswordResetTokensRepository,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Terbitkan token reset baru untuk user. Menginvalidasi SEMUA token
   * lama milik user ini dulu (lihat komentar di
   * `PasswordResetTokensRepository.invalidateAllForUser`) -- jadi
   * kapan pun, cuma satu link reset yang valid per user.
   */
  async issue(userId: number): Promise<IssuedPasswordResetToken> {
    await this.passwordResetTokensRepository.invalidateAllForUser(userId);

    // 32 byte random (bukan 64 seperti refresh token) -- cukup jauh di
    // atas ambang brute-force praktis untuk token yang usianya cuma
    // puluhan menit (lihat PASSWORD_RESET_TOKEN_EXPIRES_IN), beda dari
    // refresh token yang bisa hidup berhari-hari jadi butuh margin
    // keamanan lebih besar.
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    const expiresInStr = this.configService.get<string>(
      'passwordReset.tokenExpiresIn',
    ) as StringValue;
    const expiresAt = new Date(Date.now() + ms(expiresInStr));

    const row = await this.passwordResetTokensRepository.create({
      userId,
      tokenHash,
      expiresAt,
    });

    return { rawToken, expiresAt: row.expiresAt };
  }

  /**
   * "Tukar" token mentah dengan userId pemiliknya, SEKALIGUS menandainya
   * terpakai -- atomik di level repository (lihat komentar `.consume()`
   * di sana). Return `null` kalau token tidak dikenal/sudah
   * dipakai/sudah kedaluwarsa -- ketiganya sengaja diperlakukan SAMA
   * oleh pemanggil (AuthService), tidak dibedakan pesan errornya, biar
   * tidak membocorkan informasi soal token mana yang "pernah valid".
   */
  async consume(rawToken: string): Promise<{ userId: number } | null> {
    const tokenHash = hashToken(rawToken);
    const row = await this.passwordResetTokensRepository.consume(tokenHash);
    return row ? { userId: row.userId } : null;
  }
}
