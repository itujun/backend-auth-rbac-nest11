import { Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { BaseRepository } from '../../../core/repositories/base.repository';
import { emailVerificationTokens } from '../../../database/schema/email-verification-tokens.schema';

export interface CreateEmailVerificationTokenInput {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class EmailVerificationTokensRepository extends BaseRepository {
  create(input: CreateEmailVerificationTokenInput) {
    return this.db
      .insert(emailVerificationTokens)
      .values(input)
      .returning()
      .then((rows) => rows[0]);
  }

  /** Sama alasannya dengan PasswordResetTokensRepository.invalidateAllForUser(). */
  async invalidateAllForUser(userId: number): Promise<void> {
    await this.db
      .update(emailVerificationTokens)
      .set({ isUsed: true })
      .where(
        and(
          eq(emailVerificationTokens.userId, userId),
          eq(emailVerificationTokens.isUsed, false),
        ),
      );
  }

  /** Sama alasannya dengan PasswordResetTokensRepository.consume() -- atomik. */
  async consume(tokenHash: string) {
    const [row] = await this.db
      .update(emailVerificationTokens)
      .set({ isUsed: true })
      .where(
        and(
          eq(emailVerificationTokens.tokenHash, tokenHash),
          eq(emailVerificationTokens.isUsed, false),
          gt(emailVerificationTokens.expiresAt, new Date()),
        ),
      )
      .returning();
    return row ?? null;
  }
}
