import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { BaseRepository } from '../../core/repositories/base.repository';
import { permissions, rolePermissions } from '../../database/schema';

@Injectable()
export class RolePermissionsRepository extends BaseRepository {
  /** Daftar permission (lengkap, bukan cuma id) yang dimiliki sebuah role. */
  listPermissionsForRole(roleId: number) {
    return this.db
      .select({
        id: permissions.id,
        name: permissions.name,
        description: permissions.description,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));
  }

  /**
   * Ganti SELURUH daftar permission sebuah role dengan `permissionIds`
   * yang baru — pola "replace all" (hapus semua baris lama, insert set
   * baru) dalam satu transaction. Lebih sederhana & tetap benar
   * dibanding diffing tambah/kurang satu-satu, cocok untuk ukuran data
   * role_permissions yang biasanya kecil per role.
   */
  async syncPermissions(
    roleId: number,
    permissionIds: number[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, roleId));

      if (permissionIds.length > 0) {
        await tx
          .insert(rolePermissions)
          .values(
            permissionIds.map((permissionId) => ({ roleId, permissionId })),
          );
      }
    });
  }
}
