import { Injectable } from '@nestjs/common';
import { count, desc, gte, isNull, sql } from 'drizzle-orm';
import { BaseRepository } from '../../core/repositories/base.repository';
import { auditLogs, permissions, roles, users } from '../../database/schema';

export interface UserCountsRow {
  total: number;
  active: number;
  verified: number;
}

/**
 * SEMUA query di sini murni agregasi (COUNT/CASE WHEN), TIDAK ada satu
 * pun yang mengembalikan baris data mentah user/role/permission --
 * modul dashboard sengaja tidak boleh jadi "pintu belakang" untuk
 * melihat data yang harusnya lewat endpoint masing-masing (GET /users,
 * dst, yang punya permission & filter sendiri). Satu-satunya
 * pengecualian: findRecentAuditLogs(), yang tetap cuma ambil kolom
 * ringkas yang sama dengan yang sudah publik lewat GET /audit-logs.
 */
@Injectable()
export class DashboardRepository extends BaseRepository {
  /**
   * SATU query (bukan tiga terpisah) buat total/active/verified --
   * `count(sql CASE WHEN ...)` menghitung kondisional dalam satu scan
   * tabel, bukan tiga round-trip DB berbeda. `inactive`/`unverified`
   * sengaja TIDAK dihitung di sini juga (cukup total - active/verified
   * di service) -- makin sedikit cabang CASE WHEN, makin gampang dibaca.
   */
  async countUsers(): Promise<UserCountsRow> {
    const [row] = await this.db
      .select({
        total: count(),
        active: count(sql`CASE WHEN ${users.isActive} THEN 1 END`),
        verified: count(
          sql`CASE WHEN ${users.emailVerifiedAt} IS NOT NULL THEN 1 END`,
        ),
      })
      .from(users)
      .where(isNull(users.deletedAt));

    return row ?? { total: 0, active: 0, verified: 0 };
  }

  async countRoles(): Promise<number> {
    const [row] = await this.db.select({ value: count() }).from(roles);
    return row?.value ?? 0;
  }

  async countPermissions(): Promise<number> {
    const [row] = await this.db.select({ value: count() }).from(permissions);
    return row?.value ?? 0;
  }

  async countAuditLogsSince(since: Date): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(auditLogs)
      .where(gte(auditLogs.createdAt, since));
    return row?.value ?? 0;
  }

  findRecentAuditLogs(limit: number) {
    return this.db.query.auditLogs.findMany({
      orderBy: desc(auditLogs.createdAt),
      limit,
    });
  }
}
