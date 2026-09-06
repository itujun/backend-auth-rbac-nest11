import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import {
  schema,
  permissions,
  roles,
  rolePermissions,
  users,
  userRoles,
} from '../schema';

/**
 * Seed script standalone (BUKAN lewat Nest DI) — pola umum untuk
 * skrip database yang dijalankan sekali lewat CLI (`npm run db:seed`),
 * bukan bagian dari request lifecycle aplikasi.
 *
 * Kenapa seed ini perlu ada?
 * Karena SEMUA endpoint role/permission dilindungi @RequirePermission,
 * tidak ada cara membuat role/permission pertama lewat API itu sendiri
 * (chicken-and-egg problem). Seed ini membuat role `superadmin` dengan
 * seluruh baseline permission, lalu (opsional) meng-assign-nya ke user
 * yang emailnya cocok dengan env `SEED_ADMIN_EMAIL`.
 *
 * Alur pemakaian:
 *   1. Register user biasa lewat POST /auth/register
 *   2. Set SEED_ADMIN_EMAIL=email_tadi di .env
 *   3. Jalankan `npm run db:seed`
 *   4. User itu sekarang superadmin — login ulang untuk pastikan
 *      (walau sebenarnya tidak wajib, karena permission dicek live
 *      dari DB, bukan dari isi JWT — lihat AuthorizationService)
 */

const BASELINE_PERMISSIONS: Array<{ name: string; description: string }> = [
  { name: 'user:read', description: 'Melihat daftar user (admin)' },
  { name: 'role:create', description: 'Membuat role baru' },
  { name: 'role:read', description: 'Melihat daftar/detail role' },
  { name: 'role:update', description: 'Mengubah role' },
  { name: 'role:delete', description: 'Menghapus role' },
  {
    name: 'role:manage-permissions',
    description: 'Mengatur permission yang dimiliki sebuah role',
  },
  {
    name: 'role:manage-users',
    description: 'Assign/cabut role dari user',
  },
  { name: 'permission:create', description: 'Membuat permission baru' },
  { name: 'permission:read', description: 'Melihat daftar/detail permission' },
  { name: 'permission:update', description: 'Mengubah permission' },
  { name: 'permission:delete', description: 'Menghapus permission' },
  {
    name: 'profile:read',
    description: 'Melihat profile user lain (admin)',
  },
  {
    name: 'profile:update',
    description: 'Mengubah profile user lain (admin)',
  },
];

const SUPERADMIN_ROLE_NAME = 'superadmin';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log('1. Seeding baseline permissions...');
  for (const permission of BASELINE_PERMISSIONS) {
    await db
      .insert(permissions)
      .values(permission)
      .onConflictDoNothing({ target: permissions.name });
  }

  console.log('2. Seeding role superadmin...');
  await db
    .insert(roles)
    .values({
      name: SUPERADMIN_ROLE_NAME,
      description: 'Akses penuh ke seluruh sistem',
    })
    .onConflictDoNothing({ target: roles.name });

  const superadminRole = await db.query.roles.findFirst({
    where: eq(roles.name, SUPERADMIN_ROLE_NAME),
  });

  if (!superadminRole) {
    throw new Error('Gagal membuat/menemukan role superadmin');
  }

  const allPermissions = await db.query.permissions.findMany();

  console.log(
    `3. Menyambungkan ${allPermissions.length} permission ke role superadmin...`,
  );
  for (const permission of allPermissions) {
    await db
      .insert(rolePermissions)
      .values({ roleId: superadminRole.id, permissionId: permission.id })
      .onConflictDoNothing({
        target: [rolePermissions.roleId, rolePermissions.permissionId],
      });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL;

  if (!adminEmail) {
    console.log(
      '4. SEED_ADMIN_EMAIL tidak diset — lewati assign role ke user manapun.\n' +
        '   Set env ini ke email user yang sudah register, lalu jalankan ulang seed.',
    );
  } else {
    const user = await db.query.users.findFirst({
      where: eq(users.email, adminEmail),
    });

    if (!user) {
      console.warn(
        `4. User dengan email "${adminEmail}" tidak ditemukan — lewati.\n` +
          '   Register user itu dulu lewat POST /auth/register, lalu jalankan seed lagi.',
      );
    } else {
      const existingAssignment = await db.query.userRoles.findFirst({
        where: and(
          eq(userRoles.userId, user.id),
          eq(userRoles.roleId, superadminRole.id),
        ),
      });

      if (existingAssignment) {
        console.log(`4. User "${adminEmail}" sudah memiliki role superadmin.`);
      } else {
        await db
          .insert(userRoles)
          .values({ userId: user.id, roleId: superadminRole.id });
        console.log(
          `4. Role superadmin berhasil di-assign ke "${adminEmail}".`,
        );
      }
    }
  }

  await pool.end();
  console.log('Seeding selesai.');
}

main().catch((err: unknown) => {
  console.error('Seeding gagal:', err);
  process.exit(1);
});
