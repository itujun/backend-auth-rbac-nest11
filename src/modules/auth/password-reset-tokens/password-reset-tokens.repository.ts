import { Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { BaseRepository } from '../../../core/repositories/base.repository';
import { passwordResetTokens } from '../../../database/schema';

export interface CreatePasswordResetTokenInput {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class PasswordResetTokensRepository extends BaseRepository {
  create(input: CreatePasswordResetTokenInput) {
    return this.db
      .insert(passwordResetTokens)
      .values(input)
      .returning()
      .then((rows) => rows[0]);
  }

  /**
   * Dipanggil SEBELUM menerbitkan token baru (lihat
   * PasswordResetTokensService.issue()) -- memastikan cuma ada SATU
   * token aktif per user kapan saja. Tanpa ini, user yang klik "lupa
   * password" berkali-kali akan punya banyak token valid sekaligus,
   * semuanya bisa dipakai -- attacker yang entah bagaimana dapat salah
   * satu link lama tetap bisa reset password walau user sudah minta
   * link baru.
   */
  async invalidateAllForUser(userId: number): Promise<void> {
    await this.db
      .update(passwordResetTokens)
      .set({ isUsed: true })
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          eq(passwordResetTokens.isUsed, false),
        ),
      );
  }

  /**
   * "Konsumsi" token dalam SATU query atomik (UPDATE ... WHERE ...
   * RETURNING), BUKAN find-lalu-update dua langkah terpisah. Kalau
   * dipisah, ada celah race condition: dua request `reset-password`
   * dengan token yang sama datang nyaris bersamaan, keduanya lolos
   * pengecekan `isUsed = false` sebelum salah satunya sempat menandai
   * token itu terpakai -- akibatnya password bisa "direset dua kali"
   * dari satu token yang harusnya sekali pakai. WHERE isUsed=false di
   * level SQL menjamin cuma SATU request yang bisa berhasil UPDATE,
   * siapa pun yang sampai ke database lebih dulu.
   */
  async consume(tokenHash: string) {
    const [row] = await this.db
      .update(passwordResetTokens)
      .set({ isUsed: true })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          eq(passwordResetTokens.isUsed, false),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .returning();
    return row ?? null;
  }
}
