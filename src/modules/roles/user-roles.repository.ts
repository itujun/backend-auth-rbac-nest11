import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { BaseRepository } from '../../core/repositories/base.repository';
import { userRoles, users } from '../../database/schema';

@Injectable()
export class UserRolesRepository extends BaseRepository {
  findAssignment(userId: number, roleId: number) {
    return this.db.query.userRoles.findFirst({
      where: and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)),
    });
  }

  async assign(userId: number, roleId: number): Promise<void> {
    await this.db.insert(userRoles).values({ userId, roleId });
  }

  async revoke(userId: number, roleId: number): Promise<void> {
    await this.db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
  }

  /** Daftar user (tanpa passwordHash) yang memiliki role tertentu. */
  listUsersForRole(roleId: number) {
    return this.db
      .select({
        id: users.id,
        email: users.email,
        isActive: users.isActive,
      })
      .from(userRoles)
      .innerJoin(users, eq(userRoles.userId, users.id))
      .where(eq(userRoles.roleId, roleId));
  }
}
