import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { BaseRepository } from '../../core/repositories/base.repository';
import { profiles } from '../../database/schema';

export interface UpdateProfileFields {
  fullName?: string;
  phone?: string;
  bio?: string;
}

@Injectable()
export class ProfilesRepository extends BaseRepository {
  findByUserId(userId: number) {
    return this.db.query.profiles.findFirst({
      where: eq(profiles.userId, userId),
    });
  }

  async updateByUserId(userId: number, data: UpdateProfileFields) {
    const [row] = await this.db
      .update(profiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(profiles.userId, userId))
      .returning();
    return row;
  }

  async updateAvatarUrl(userId: number, avatarUrl: string) {
    const [row] = await this.db
      .update(profiles)
      .set({ avatarUrl, updatedAt: new Date() })
      .where(eq(profiles.userId, userId))
      .returning();
    return row;
  }
}
