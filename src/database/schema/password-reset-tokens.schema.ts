import {
  boolean,
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.schema';

/**
 * Sengaja tabel TERPISAH dari `refresh_tokens`, bukan reuse -- walau
 * bentuknya mirip (tokenHash, expiresAt), semantiknya beda: refresh
 * token dirancang untuk dipakai BERULANG (rotasi), token reset password
 * SEKALI PAKAI lalu mati. Menyatukan keduanya dalam satu tabel akan
 * memaksa kolom seperti `replacedById` (khusus rotasi) jadi tidak
 * relevan untuk baris reset password, dan sebaliknya.
 */
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Sama seperti refresh_tokens -- simpan HASH token, bukan mentahnya.
  // Kalau DB bocor, attacker tidak langsung dapat token yang valid.
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  // Sekali dipakai (lewat POST /auth/reset-password yang berhasil),
  // langsung true dan tidak bisa dipakai lagi -- beda dari
  // `refreshTokens.isRevoked` yang bisa jadi true karena banyak alasan
  // (logout, reuse terdeteksi, dst), di sini cuma satu alasan: sudah
  // dipakai (atau sengaja diinvalidasi karena ada request baru, lihat
  // PasswordResetTokensService.issue()).
  isUsed: boolean('is_used').notNull().default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  }),
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
