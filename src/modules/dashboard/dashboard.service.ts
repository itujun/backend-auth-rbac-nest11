import { Injectable } from '@nestjs/common';
import { DashboardRepository } from './dashboard.repository';
import { DashboardSummaryResponseDto } from './dto/dashboard-summary-response.dto';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RECENT_AUDIT_LOG_LIMIT = 10;

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  /**
   * Semua query dijalankan PARALEL (Promise.all), bukan berurutan --
   * enam query ini saling independen (tidak ada yang butuh hasil query
   * lain), jadi tidak ada alasan menunggu bergantian. Endpoint ini juga
   * TIDAK di-cache (beda dari PermissionsCacheService) -- angka
   * ringkasan di dashboard portfolio ini tidak sering diakses
   * (bukan endpoint per-request seperti cek permission), jadi
   * kompleksitas cache-invalidation tidak sepadan manfaatnya di sini.
   */
  async getSummary(): Promise<DashboardSummaryResponseDto> {
    const now = Date.now();
    const [userCounts, totalRoles, totalPermissions, last24h, last7d, recent] =
      await Promise.all([
        this.dashboardRepository.countUsers(),
        this.dashboardRepository.countRoles(),
        this.dashboardRepository.countPermissions(),
        this.dashboardRepository.countAuditLogsSince(
          new Date(now - MS_PER_DAY),
        ),
        this.dashboardRepository.countAuditLogsSince(
          new Date(now - 7 * MS_PER_DAY),
        ),
        this.dashboardRepository.findRecentAuditLogs(RECENT_AUDIT_LOG_LIMIT),
      ]);

    return {
      users: {
        total: userCounts.total,
        active: userCounts.active,
        inactive: userCounts.total - userCounts.active,
        verified: userCounts.verified,
        unverified: userCounts.total - userCounts.verified,
      },
      totalRoles,
      totalPermissions,
      auditActivity: { last24h, last7d },
      recentAuditLogs: recent.map((log) => ({
        id: log.id,
        action: log.action,
        actorEmail: log.actorEmail,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }
}
