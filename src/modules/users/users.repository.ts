import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNull,
  type SQL,
} from 'drizzle-orm';
import { BaseRepository } from '../../core/repositories/base.repository';
import { profiles, users, type User } from '../../database/schema';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import { paginate, toOffset } from '../../common/utils/pagination.util';

export interface CreateUserWithProfileInput {
  email: string;
  passwordHash: string;
  fullName?: string;
}

const SORT_COLUMN_MAP = {
  email: users.email,
  createdAt: users.createdAt,
} as const;

// Kolom yang aman dikembalikan di list — TIDAK menyertakan
// `passwordHash` sama sekali, bahkan sebelum sampai ke service layer
// (defense in depth: tidak sekadar mengandalkan `sanitize()` di
// UsersService seperti pada single-user lookup).
const SAFE_USER_COLUMNS = {
  id: users.id,
  email: users.email,
  isActive: users.isActive,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  deletedAt: users.deletedAt,
};

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
   * List user untuk admin — TIDAK PERNAH menyertakan user yang sudah
   * soft-deleted (`deletedAt IS NOT NULL`), terlepas dari filter apa
   * yang dikirim client.
   */
  findAll(query: FindUsersQueryDto) {
    const { page, limit, search, isActive, sortBy, sortOrder } = query;

    const conditions = [isNull(users.deletedAt)];
    if (search) {
      conditions.push(ilike(users.email, `%${search}%`));
    }
    if (isActive !== undefined) {
      conditions.push(eq(users.isActive, isActive));
    }
    const whereClause: SQL = and(...conditions) as SQL;

    const orderColumn = SORT_COLUMN_MAP[sortBy];
    const orderClause =
      sortOrder === 'desc' ? desc(orderColumn) : asc(orderColumn);

    const dataQuery = this.db
      .select(SAFE_USER_COLUMNS)
      .from(users)
      .where(whereClause)
      .orderBy(orderClause)
      .limit(limit)
      .offset(toOffset(page, limit));

    const countQuery = this.db
      .select({ value: count() })
      .from(users)
      .where(whereClause)
      .then((rows) => rows[0]?.value ?? 0);

    return paginate(dataQuery, countQuery, { page, limit });
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
