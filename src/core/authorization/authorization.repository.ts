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
}
