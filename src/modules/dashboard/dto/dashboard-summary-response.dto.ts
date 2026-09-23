import { ApiProperty } from '@nestjs/swagger';

export class DashboardUserStatsDto {
  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 38 })
  active: number;

  @ApiProperty({ example: 4 })
  inactive: number;

  @ApiProperty({ example: 30 })
  verified: number;

  @ApiProperty({ example: 12 })
  unverified: number;
}

export class DashboardAuditActivityDto {
  @ApiProperty({
    example: 7,
    description: 'Jumlah entri audit log 24 jam terakhir',
  })
  last24h: number;

  @ApiProperty({
    example: 53,
    description: 'Jumlah entri audit log 7 hari terakhir',
  })
  last7d: number;
}

export class DashboardRecentAuditLogDto {
  @ApiProperty({ example: 128 })
  id: number;

  @ApiProperty({ example: 'auth.login_success' })
  action: string;

  @ApiProperty({ example: 'budi@example.com', nullable: true })
  actorEmail: string | null;

  @ApiProperty({ example: '2026-09-22T08:15:00.000Z' })
  createdAt: string;
}

export class DashboardSummaryResponseDto {
  @ApiProperty({ type: DashboardUserStatsDto })
  users: DashboardUserStatsDto;

  @ApiProperty({ example: 5, description: 'Total role yang terdaftar' })
  totalRoles: number;

  @ApiProperty({ example: 14, description: 'Total permission yang terdaftar' })
  totalPermissions: number;

  @ApiProperty({ type: DashboardAuditActivityDto })
  auditActivity: DashboardAuditActivityDto;

  @ApiProperty({ type: [DashboardRecentAuditLogDto] })
  recentAuditLogs: DashboardRecentAuditLogDto[];
}
