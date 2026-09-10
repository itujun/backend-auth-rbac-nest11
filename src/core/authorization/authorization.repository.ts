import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { BaseRepository } from '../repositories/base.repository';
import { permissions, rolePermissions, userRoles } from '../../database/schema';

@Injectable()
export class AuthorizationRepository extends BaseRepository {
  /**
   * Ambil semua nama permission yang dimiliki user, lewat rantai
   * user_roles -> role_permissions -> permissions. Kalau user punya
   * lebih dari satu role dengan permission yang sama, hasilnya bisa
   * duplikat — dedup dilakukan di layer service (pakai Set).
   */
  async findPermissionNamesByUserId(userId: number): Promise<string[]> {
    const rows = await this.db
      .select({ name: permissions.name })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(userRoles.userId, userId));

    return rows.map((row) => row.name);
  }

  /**
   * Cari SEMUA user yang terdampak kalau sebuah permission dihapus atau
   * berubah nama -- yaitu user manapun yang memegang role yang (saat
   * ini) memiliki permission tersebut.
   *
   * Dipakai PermissionsService untuk fan-out invalidation cache. Query
   * ini SENGAJA cuma JOIN role_permissions -> user_roles (tanpa perlu
   * tabel `permissions` sama sekali) -- cukup filter by `permissionId`
   * di role_permissions, lalu ambil semua userId yang punya salah satu
   * role terkait. Satu round-trip ke Postgres, bukan "cari roleId dulu,
   * lalu cari userId" dua query terpisah.
   *
   * PENTING soal urutan pemanggilan: method ini HARUS dipanggil SEBELUM
   * permission-nya benar-benar dihapus dari DB. Setelah dihapus, baris
   * role_permissions yang mereferensikannya sudah ikut lenyap lewat
   * `ON DELETE CASCADE`, jadi query ini akan mengembalikan array kosong
   * -- fan-out invalidation-nya jadi tidak berguna sama sekali.
   */
  async findUserIdsAffectedByPermission(
    permissionId: number,
  ): Promise<number[]> {
    const rows = await this.db
      .selectDistinct({ userId: userRoles.userId })
      .from(rolePermissions)
      .innerJoin(userRoles, eq(rolePermissions.roleId, userRoles.roleId))
      .where(eq(rolePermissions.permissionId, permissionId));

    return rows.map((row) => row.userId);
  }
}
