import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import ms from 'ms';
import type { StringValue } from 'ms';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { hashToken } from '../utils/hash-token.util';

export interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface IssuedRefreshToken {
  id: number;
  rawToken: string;
  expiresAt: Date;
}

@Injectable()
export class RefreshTokensService {
  private readonly logger = new Logger(RefreshTokensService.name);

  constructor(
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly configService: ConfigService,
  ) {}

  /** Buat refresh token baru untuk user (dipakai saat login DAN saat rotasi). */
  async issue(
    userId: number,
    meta: RequestMeta = {},
  ): Promise<IssuedRefreshToken> {
    const rawToken = randomBytes(64).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresInStr = this.configService.get<string>(
      'jwt.refreshExpiresIn',
    ) as StringValue;
    const expiresAt = new Date(Date.now() + ms(expiresInStr));

    const row = await this.refreshTokensRepository.create({
      userId,
      tokenHash,
      expiresAt,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    return { id: row.id, rawToken, expiresAt: row.expiresAt };
  }

  /**
   * Rotasi: tukar refresh token lama dengan yang baru.
   * Return userId supaya caller (AuthService) bisa terbitkan access
   * token baru tanpa perlu query user lagi.
   */
  async rotate(
    rawToken: string,
    meta: RequestMeta = {},
  ): Promise<{ userId: number; refreshToken: IssuedRefreshToken }> {
    const tokenHash = hashToken(rawToken);
    const existing =
      await this.refreshTokensRepository.findByTokenHash(tokenHash);

    const invalidSessionError = new UnauthorizedException(
      'Sesi tidak valid, silakan login ulang',
    );

    if (!existing) {
      throw invalidSessionError;
    }

    if (existing.isRevoked) {
      // Token yang SUDAH di-revoke dipakai lagi -> sinyal kuat token ini
      // dicuri (rotasi normal seharusnya membuat token lama tidak
      // terpakai lagi). Respons defensif: matikan SEMUA sesi user ini,
      // paksa login ulang di semua device.
      this.logger.warn(
        `Refresh token reuse terdeteksi untuk user #${existing.userId} — semua sesi di-revoke.`,
      );
      await this.refreshTokensRepository.revokeAllForUser(existing.userId);
      throw invalidSessionError;
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      await this.refreshTokensRepository.revoke(existing.id);
      throw new UnauthorizedException(
        'Sesi telah berakhir, silakan login ulang',
      );
    }

    const newToken = await this.issue(existing.userId, meta);
    // Sambungkan rantai rotasi: token lama -> token baru (kolom replaced_by_id di ERD)
    await this.refreshTokensRepository.revoke(existing.id, newToken.id);

    return { userId: existing.userId, refreshToken: newToken };
  }

  /**
   * Logout satu sesi (device saat ini saja). Idempotent — tidak error
   * kalau token sudah tidak valid. Mengembalikan `userId` pemilik sesi
   * yang di-revoke (atau `null` kalau token tidak ditemukan/sudah
   * di-revoke) — dipakai AuthService untuk mencatat audit log,
   * BUKAN untuk keperluan logic revoke itu sendiri.
   */
  async revoke(rawToken: string): Promise<{ userId: number } | null> {
    const tokenHash = hashToken(rawToken);
    const existing =
      await this.refreshTokensRepository.findByTokenHash(tokenHash);

    if (!existing || existing.isRevoked) {
      return null;
    }

    await this.refreshTokensRepository.revoke(existing.id);
    return { userId: existing.userId };
  }

  /** Logout semua sesi/device milik user (dipanggil dari endpoint yang butuh access token valid). */
  revokeAllForUser(userId: number): Promise<void> {
    return this.refreshTokensRepository.revokeAllForUser(userId);
  }
}
