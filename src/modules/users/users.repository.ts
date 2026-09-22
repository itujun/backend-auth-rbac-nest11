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
  // Diisi (new Date()) HANYA oleh alur admin-create (UsersService.create()) --
  // self-registration (AuthService.register()) selalu mengirim undefined
  // di sini, karena email BARU dianggap terverifikasi setelah user klik
  // link di email, bukan seketika saat akun dibuat. Admin yang membuat
  // user secara langsung dianggap sudah memvalidasi email itu sendiri.
  emailVerifiedAt?: Date;
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
   * Toggle suspend/reactivate. HANYA `isActive` + `updatedAt` yang
   * disentuh -- tidak pernah `deletedAt` (itu wewenang `softDelete()`
   * saja). Dipisah dari `softDelete` karena dua konsep ini beda sifat:
   * suspend reversibel (bisa di-reactivate), delete tidak (lihat
   * `UsersService.reactivate()` yang sengaja tidak menyentuh user yang
   * sudah soft-deleted, karena `findById` sudah exclude mereka).
   */
  async updateStatus(id: number, isActive: boolean): Promise<User> {
    const [user] = await this.db
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  /**
   * Soft delete: isi `deletedAt` + paksa `isActive = false` sekalian
   * (defense in depth -- `findActiveById`/`findById` sudah cukup
   * exclude lewat `deletedAt`, tapi kalau ada query lain di masa depan
   * yang lupa filter `deletedAt`, `isActive = false` jadi lapisan
   * pengaman kedua). Baris tetap ada di DB (bukan `DELETE` sungguhan)
   * supaya riwayat & relasi audit log (`onDelete: 'set null'`) tetap
   * bisa dilacak -- sama filosofinya dengan `audit_logs.actorUserId`.
   */
  async softDelete(id: number): Promise<User> {
    const [user] = await this.db
      .update(users)
      .set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  /**
   * Dipanggil SATU tempat saja: `AuthService.verifyEmail()`. Setipis
   * `updatePassword()` -- tidak ada audit log di sini, dicatat di
   * AuthService sebagai `email_verification.completed`.
   */
  async markEmailVerified(id: number): Promise<User> {
    const [user] = await this.db
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  /**
   * Dipanggil SATU tempat saja: `AuthService.resetPassword()` (lewat
   * `UsersService.updatePassword()`). Method setipis mungkin -- tidak
   * ada audit log di sini, karena pencatatannya (`password_reset.completed`)
   * jadi tanggung jawab `AuthService`, bukan `UsersRepository`/`UsersService`
   * (konsisten dengan `updateStatus`/`softDelete` di file ini yang juga
   * TIDAK audit log sendiri -- audit selalu ditulis satu layer di atas,
   * oleh caller yang tahu KONTEKS aksinya, bukan oleh layer data).
   */
  async updatePassword(id: number, passwordHash: string): Promise<User> {
    const [user] = await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
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
          emailVerifiedAt: input.emailVerifiedAt,
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
