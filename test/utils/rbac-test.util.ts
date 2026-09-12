import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../../src/database/database.constants';
import {
  permissions,
  roles,
  rolePermissions,
  userRoles,
} from '../../src/database/schema';

/**
 * Buat 1 permission langsung lewat DB (idempotent -- ON CONFLICT DO
 * NOTHING kalau nama sudah ada) lalu return row-nya.
 *
 * SENGAJA insert langsung ke DB, BUKAN lewat POST /api/permissions --
 * endpoint itu sendiri dilindungi permission `permission:create`, yang
 * notabene belum tentu dimiliki siapapun di database yang baru saja
 * di-truncate. Sama persis alasan `seed.ts` production insert langsung
 * lewat drizzle, bukan lewat API-nya sendiri.
 */
export async function ensurePermission(app: INestApplication, name: string) {
  const db = app.get<DrizzleDb>(DRIZZLE);

  await db
    .insert(permissions)
    .values({ name })
    .onConflictDoNothing({ target: permissions.name });

  const row = await db.query.permissions.findFirst({
    where: eq(permissions.name, name),
  });

  if (!row) {
    throw new Error(`Gagal membuat/menemukan permission "${name}"`);
  }
  return row;
}

/**
 * Buat role baru (nama otomatis unik per panggilan lewat randomUUID --
 * hindari bentrok kalau dipanggil beberapa kali dalam satu test), isi
 * dengan `permissionNames`, lalu assign ke `userId`. Cara "jadi
 * admin"/"punya izin X" untuk keperluan test tanpa lewat endpoint
 * role/permission yang justru dilindungi izin itu sendiri.
 *
 * CATATAN cache: PermissionsCacheService di-skip (Redis sengaja tidak
 * dijalankan di E2E -- lihat global-setup.ts), jadi setiap permission
 * check SELALU query fresh ke DB, tidak ada risiko stale cache di sini.
 * Kalau suatu saat E2E ini dijalankan DENGAN Redis nyala, perlu
 * `PermissionsCacheService.invalidateUser()` juga setelah ini -- di
 * sini SENGAJA tidak dipanggil karena user yang di-grant selalu user
 * baru dari tabel yang baru di-truncate, tidak mungkin ada cache lama.
 */
export async function grantPermissionsToUser(
  app: INestApplication,
  userId: number,
  permissionNames: string[],
): Promise<void> {
  const db = app.get<DrizzleDb>(DRIZZLE);

  const permissionRows = await Promise.all(
    permissionNames.map((name) => ensurePermission(app, name)),
  );

  const [role] = await db
    .insert(roles)
    .values({ name: `e2e-role-${randomUUID()}` })
    .returning();

  if (permissionRows.length > 0) {
    await db.insert(rolePermissions).values(
      permissionRows.map((p) => ({
        roleId: role.id,
        permissionId: p.id,
      })),
    );
  }

  await db.insert(userRoles).values({ userId, roleId: role.id });
}
