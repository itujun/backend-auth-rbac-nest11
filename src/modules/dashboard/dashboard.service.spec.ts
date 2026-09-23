import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './dashboard.repository';
import type { AuditLog } from '../../database/schema';

interface FakeUserCounts {
  total: number;
  active: number;
  verified: number;
}

function createService() {
  const countUsersMock = jest
    .fn<Promise<FakeUserCounts>, []>()
    .mockResolvedValue({ total: 10, active: 8, verified: 6 });
  const countRolesMock = jest.fn<Promise<number>, []>().mockResolvedValue(3);
  const countPermissionsMock = jest
    .fn<Promise<number>, []>()
    .mockResolvedValue(12);
  const countAuditLogsSinceMock = jest
    .fn<Promise<number>, [Date]>()
    .mockResolvedValue(0);
  const findRecentAuditLogsMock = jest
    .fn<Promise<AuditLog[]>, [number]>()
    .mockResolvedValue([]);

  const repository = {
    countUsers: countUsersMock,
    countRoles: countRolesMock,
    countPermissions: countPermissionsMock,
    countAuditLogsSince: countAuditLogsSinceMock,
    findRecentAuditLogs: findRecentAuditLogsMock,
  } as unknown as DashboardRepository;

  const service = new DashboardService(repository);

  return {
    service,
    countUsersMock,
    countRolesMock,
    countPermissionsMock,
    countAuditLogsSinceMock,
    findRecentAuditLogsMock,
  };
}

describe('DashboardService', () => {
  it('menghitung inactive/unverified dari (total - active/verified), bukan query terpisah', async () => {
    const { service } = createService();

    const result = await service.getSummary();

    expect(result.users).toEqual({
      total: 10,
      active: 8,
      inactive: 2,
      verified: 6,
      unverified: 4,
    });
  });

  it('memanggil countAuditLogsSince DUA KALI dengan rentang berbeda (24 jam & 7 hari)', async () => {
    const { service, countAuditLogsSinceMock } = createService();

    await service.getSummary();

    expect(countAuditLogsSinceMock).toHaveBeenCalledTimes(2);
    const [since24h] = countAuditLogsSinceMock.mock.calls[0];
    const [since7d] = countAuditLogsSinceMock.mock.calls[1];
    const diffMs = since24h.getTime() - since7d.getTime();
    expect(diffMs).toBeCloseTo(6 * 24 * 60 * 60 * 1000, -3);
  });

  it('meneruskan totalRoles & totalPermissions apa adanya dari repository', async () => {
    const { service } = createService();

    const result = await service.getSummary();

    expect(result.totalRoles).toBe(3);
    expect(result.totalPermissions).toBe(12);
  });

  it('mengubah createdAt recentAuditLogs jadi ISO string (bukan objek Date mentah)', async () => {
    const { service, findRecentAuditLogsMock } = createService();
    findRecentAuditLogsMock.mockResolvedValue([
      {
        id: 1,
        action: 'auth.login_success',
        actorUserId: 5,
        actorEmail: 'budi@example.com',
        resourceType: null,
        resourceId: null,
        metadata: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date('2026-09-22T08:15:00.000Z'),
      },
    ]);

    const result = await service.getSummary();

    expect(result.recentAuditLogs).toEqual([
      {
        id: 1,
        action: 'auth.login_success',
        actorEmail: 'budi@example.com',
        createdAt: '2026-09-22T08:15:00.000Z',
      },
    ]);
  });
});
