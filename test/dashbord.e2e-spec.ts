import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, closeTestApp } from './utils/create-test-app';
import { cleanDatabase } from './utils/db-cleanup';
import { registerAndLogin } from './utils/auth-test.util';
import { grantPermissionsToUser } from './utils/rbac-test.util';

describe('Dashboard (e2e)', () => {
  let app: INestApplication<App>;

  const api = () => request(app.getHttpServer());
  const authed = (req: request.Test, token: string) =>
    req.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(app);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  describe('GET /api/dashboard/summary', () => {
    it('tanpa permission dashboard:read -> 403', async () => {
      const { accessToken } = await registerAndLogin(app, {
        email: 'nopermission@example.com',
        password: 'password123',
      });

      await authed(api().get('/api/dashboard/summary'), accessToken).expect(
        403,
      );
    });

    it('dengan permission dashboard:read -> 200, angka mencerminkan data sungguhan', async () => {
      const admin = await registerAndLogin(app, {
        email: 'admin@example.com',
        password: 'password123',
      });
      await grantPermissionsToUser(app, admin.user.id, ['dashboard:read']);

      const other = await registerAndLogin(app, {
        email: 'lainnya@example.com',
        password: 'password123',
      });

      const res = await authed(
        api().get('/api/dashboard/summary'),
        admin.accessToken,
      ).expect(200);

      const {
        users,
        totalRoles,
        totalPermissions,
        auditActivity,
        recentAuditLogs,
      } = res.body.data;

      expect(users.total).toBe(2);
      expect(users.active).toBe(2);
      expect(users.inactive).toBe(0);
      expect(users.unverified).toBe(2);
      expect(users.verified).toBe(0);

      expect(typeof totalRoles).toBe('number');
      expect(typeof totalPermissions).toBe('number');
      expect(typeof auditActivity.last24h).toBe('number');
      expect(typeof auditActivity.last7d).toBe('number');
      expect(auditActivity.last24h).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(recentAuditLogs)).toBe(true);
      expect(recentAuditLogs.length).toBeGreaterThan(0);

      expect(other.user.id).toBeGreaterThan(0);
    });

    it('soft-deleted user TIDAK ikut terhitung', async () => {
      const admin = await registerAndLogin(app, {
        email: 'admin2@example.com',
        password: 'password123',
      });
      await grantPermissionsToUser(app, admin.user.id, [
        'dashboard:read',
        'user:delete',
      ]);
      const target = await registerAndLogin(app, {
        email: 'akandihapus@example.com',
        password: 'password123',
      });

      await authed(
        api().delete(`/api/users/${target.user.id}`),
        admin.accessToken,
      ).expect(200);

      const res = await authed(
        api().get('/api/dashboard/summary'),
        admin.accessToken,
      ).expect(200);

      expect(res.body.data.users.total).toBe(1);
    });
  });
});
