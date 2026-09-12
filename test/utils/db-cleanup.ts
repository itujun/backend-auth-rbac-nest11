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
 * SENGAJA TIDAK pakai RESTART IDENTITY: ID (serial/identity) dibiarkan
 * terus naik antar test, TIDAK di-reset ke 1. Alasannya bukan soal
 * Postgres, tapi soal Redis -- cache permission (PermissionsCacheService)
 * di-key berdasarkan user ID dan TIDAK ikut ke-truncate di sini (Redis
 * hidup terus lintas semua test dalam satu run, TTL 300s). Kalau ID
 * di-reset tiap test, user BARU di test B gampang kebagian ID yang SAMA
 * dengan user di test A sebelumnya -- lalu ke-tabrak cache basi milik
 * user test A yang masih nyangkut di Redis, walau user-nya sudah beda
 * total secara logis. Ini betulan kejadian & bikin RBAC test flaky
 * SELALU 403 setiap kali dijalankan dengan Redis nyala, sampai ID tidak
 * lagi ditumpangi.
 */
export async function cleanDatabase(app: INestApplication): Promise<void> {
  const db = app.get<DrizzleDb>(DRIZZLE);
  const tables = APP_TABLES.join(', ');
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables} CASCADE`));
}
