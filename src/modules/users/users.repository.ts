import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { BaseRepository } from '../../core/repositories/base.repository';
import { profiles, users, type User } from '../../database/schema';

export interface CreateUserWithProfileInput {
  email: string;
  passwordHash: string;
  fullName?: string;
}

@Injectable()
export class UsersRepository extends BaseRepository {
  /**
   * Dipakai saat login/cek duplikasi email. Sengaja TIDAK filter
   * `deletedAt` di sini — biar caller (service) yang memutuskan mau
   * apa terhadap akun soft-deleted (misal tetap tolak login dengan
   * pesan spesifik, atau izinkan re-register dengan email yang sama).
   */
  findByEmail(email: string) {
    return this.db.query.users.findFirst({
      where: eq(users.email, email),
    });
  }

  /** Dipakai JwtStrategy & endpoint /auth/me — hanya user aktif & belum dihapus. */
  findActiveById(id: number) {
    return this.db.query.users.findFirst({
      where: and(
        eq(users.id, id),
        isNull(users.deletedAt),
        eq(users.isActive, true),
      ),
    });
  }

  /**
   * Dipakai untuk operasi admin (mis. assign role) yang tidak perlu
   * user harus dalam kondisi `isActive` — cukup belum di-soft-delete.
   */
  findById(id: number) {
    return this.db.query.users.findFirst({
      where: and(eq(users.id, id), isNull(users.deletedAt)),
    });
  }

  /**
   * Insert `users` + `profiles` dalam SATU transaction.
   * Karena `profiles.user_id` NOT NULL UNIQUE (lihat ERD), user tanpa
   * profile adalah state yang tidak valid — kalau insert profile gagal,
   * insert user juga harus di-rollback.
   */
  async createWithProfile(input: CreateUserWithProfileInput): Promise<User> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email: input.email,
          passwordHash: input.passwordHash,
        })
        .returning();

      await tx.insert(profiles).values({
        userId: user.id,
        fullName: input.fullName,
      });

      return user;
    });
  }
}
