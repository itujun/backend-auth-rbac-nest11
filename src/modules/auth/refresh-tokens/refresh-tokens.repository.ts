import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { BaseRepository } from '../../../core/repositories/base.repository';
import { refreshTokens } from '../../../database/schema';

export interface CreateRefreshTokenInput {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class RefreshTokensRepository extends BaseRepository {
  async create(input: CreateRefreshTokenInput) {
    const [row] = await this.db.insert(refreshTokens).values(input).returning();
    return row;
  }

  findByTokenHash(tokenHash: string) {
    return this.db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, tokenHash),
    });
  }

  /**
   * Revoke satu row. `replacedById` diisi kalau ini bagian dari rotasi
   * (menyambung rantai token lama -> token baru); dibiarkan undefined
   * kalau ini revoke terminal (logout).
   */
  async revoke(id: number, replacedById?: number): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true, ...(replacedById ? { replacedById } : {}) })
      .where(eq(refreshTokens.id, id));
  }

  /** Dipakai saat logout-all ATAU saat mendeteksi reuse (kompromi token). */
  async revokeAllForUser(userId: number): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(
        and(
          eq(refreshTokens.userId, userId),
          eq(refreshTokens.isRevoked, false),
        ),
      );
  }
}
