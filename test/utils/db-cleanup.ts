import { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../../src/database/database.constants';

// Urutan tidak penting -- TRUNCATE ... CASCADE menangani semua foreign key
// (role_permissions -> roles/permissions, user_roles -> users/roles,
// refresh_tokens -> users, audit_logs -> users nullable) dalam SATU
// statement, jadi tidak perlu disiplin urutan delete manual per tabel.
const APP_TABLES = [
  'audit_logs',
  'refresh_tokens',
  'user_roles',
  'role_permissions',
  'profiles',
  'permissions',
  'roles',
  'users',
] as const;

/**
 * Kosongkan semua tabel aplikasi (BUKAN tabel migrasi drizzle sendiri)
 * supaya tiap test/test file mulai dari state bersih tanpa perlu
 * restart container Postgres (yang jauh lebih mahal, ~1-2 detik per
 * restart vs TRUNCATE yang hitungan milidetik).
 *
 * RESTART IDENTITY: reset counter serial/identity (id) balik ke 1 --
 * supaya assertion di test ("user baru id-nya harus 1") predictable,
 * tidak bergantung sisa data dari test sebelumnya.
 */
export async function cleanDatabase(app: INestApplication): Promise<void> {
  const db = app.get<DrizzleDb>(DRIZZLE);
  const tables = APP_TABLES.join(', ');
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`),
  );
}
