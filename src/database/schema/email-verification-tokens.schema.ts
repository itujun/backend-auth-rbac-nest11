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
 * Struktur identik `password_reset_tokens` (sekali pakai, hash
 * tersimpan bukan token mentah) tapi TETAP tabel terpisah -- dua alur
 * ini punya siklus hidup independen (user bisa lupa password kapan
 * saja setelah verifikasi, dan sebaliknya belum tentu langsung minta
 * reset password segera setelah verifikasi email), menyatukan
 * keduanya akan memaksa satu kolom `purpose` ekstra yang cuma
 * menambah kompleksitas query tanpa manfaat nyata di skala project ini.
 */
export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  isUsed: boolean('is_used').notNull().default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const emailVerificationTokensRelations = relations(
  emailVerificationTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [emailVerificationTokens.userId],
      references: [users.id],
    }),
  }),
);

export type EmailVerificationToken =
  typeof emailVerificationTokens.$inferSelect;
export type NewEmailVerificationToken =
  typeof emailVerificationTokens.$inferInsert;
