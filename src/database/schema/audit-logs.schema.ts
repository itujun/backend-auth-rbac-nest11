import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.schema';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    // Nullable SENGAJA — percobaan login GAGAL belum tentu punya user
    // valid (mis. email yang dimasukkan tidak terdaftar sama sekali).
    // onDelete 'set null' (bukan 'cascade'): riwayat audit HARUS tetap
    // ada walau user-nya nanti dihapus — itu esensi audit trail.
    actorUserId: integer('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    // Snapshot email SAAT KEJADIAN, disimpan terpisah dari relasi user —
    // kalau user dihapus atau ganti email nanti, baris audit lama tetap
    // terbaca "siapa" pelakunya tanpa perlu JOIN yang bisa saja kosong.
    actorEmail: varchar('actor_email', { length: 255 }),
    // Konvensi "domain.aksi", contoh: 'auth.login_failed', 'role.assign',
    // 'permission.delete'. String bebas (bukan enum Postgres) SENGAJA —
    // menambah jenis event baru tidak perlu migration ALTER TYPE.
    action: varchar('action', { length: 100 }).notNull(),
    // Nullable — event seperti login tidak selalu menyasar 1 resource spesifik.
    resourceType: varchar('resource_type', { length: 50 }),
    resourceId: varchar('resource_id', { length: 50 }),
    // Detail bebas per jenis event (mis. { roleId, permissionIds } untuk
    // role.sync_permissions) — jsonb, bukan text, supaya masih bisa
    // di-query/filter dari sisi Postgres kalau nanti dibutuhkan.
    metadata: jsonb('metadata'),
    ipAddress: varchar('ip_address', { length: 45 }), // cukup untuk IPv6
    userAgent: varchar('user_agent', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Tabel ini TUMBUH TERUS TANPA BATAS (tidak pernah di-update/delete
    // seperti tabel lain) dan akan sering di-filter per user & di-sort
    // per waktu (endpoint admin GET /audit-logs) — beda dari tabel lain
    // di project ini yang belum perlu index eksplisit karena ukurannya
    // relatif kecil & stabil.
    index('audit_logs_actor_user_id_idx').on(table.actorUserId),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ],
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
  }),
}));

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
