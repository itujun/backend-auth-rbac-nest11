import {
  AnyPgColumn,
  boolean,
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.schema';

export const refreshTokens = pgTable('refresh_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Kita simpan HASH dari refresh token, bukan token mentahnya.
  // Kalau DB bocor, attacker tidak langsung dapat token yang valid.
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  isRevoked: boolean('is_revoked').notNull().default(false),
  // Self-reference: dipakai untuk melacak rantai rotasi token.
  // AnyPgColumn diperlukan karena TypeScript tidak bisa infer tipe
  // dari tabel yang masih didefinisikan (circular reference).
  replacedById: integer('replaced_by_id').references(
    (): AnyPgColumn => refreshTokens.id,
  ),
  userAgent: varchar('user_agent', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 45 }), // cukup untuk IPv6
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
  replacedBy: one(refreshTokens, {
    fields: [refreshTokens.replacedById],
    references: [refreshTokens.id],
  }),
}));

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
