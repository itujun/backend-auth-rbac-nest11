import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { createTestApp, closeTestApp } from './utils/create-test-app';
import { cleanDatabase } from './utils/db-cleanup';
import { registerAndLogin } from './utils/auth-test.util';
import { grantPermissionsToUser } from './utils/rbac-test.util';
import { DRIZZLE, DrizzleDb } from '../src/database/database.constants';
import { auditLogs } from '../src/database/schema';

describe('Users management (e2e)', () => {
  let app: INestApplication<App>;
  let db: DrizzleDb;

  const api = () => request(app.getHttpServer());
  const authed = (req: request.Test, token: string) =>
    req.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get<DrizzleDb>(DRIZZLE);
  });

  beforeEach(async () => {
    await cleanDatabase(app);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  /**
   * Helper LOKAL (bukan util bersama) -- semua describe block di file
   * ini butuh "admin dengan permission tertentu", tapi permission yang
   * dibutuhkan beda-beda per block, jadi tetap diparameterkan lewat
   * argumen, bukan di-hardcode di rbac-test.util.ts yang generic. Email
   * WAJIB diisi eksplisit (bukan auto-generate) supaya tiap test tetap
   * mudah dibaca "siapa melakukan apa" dari isi test itu sendiri.
   */
  async function createAdmin(email: string, permissionNames: string[]) {
    const admin = await registerAndLogin(app, {
      email,
      password: 'password123',
    });
    await grantPermissionsToUser(app, admin.user.id, permissionNames);
    return admin;
  }

  describe('GET /api/users', () => {
    it('tanpa permission user:read -> 403', async () => {
      const { accessToken } = await registerAndLogin(app, {
        email: 'nopermission@example.com',
        password: 'password123',
      });

      await authed(api().get('/api/users'), accessToken).expect(403);
    });

    it('dengan permission user:read -> 200, response TIDAK mengandung passwordHash', async () => {
      const admin = await createAdmin('admin1@example.com', ['user:read']);

      const res = await authed(
        api().get('/api/users'),
        admin.accessToken,
      ).expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].passwordHash).toBeUndefined();
    });

    it('filter isActive=false -> hanya user yang sedang nonaktif', async () => {
      const admin = await createAdmin('admin2@example.com', [
        'user:read',
        'user:manage-status',
      ]);
      const target = await registerAndLogin(app, {
        email: 'akan-disuspend@example.com',
        password: 'password123',
      });

      await authed(
        api().patch(`/api/users/${target.user.id}/suspend`),
        admin.accessToken,
      ).expect(200);

      const res = await authed(
        api().get('/api/users?isActive=false'),
        admin.accessToken,
      ).expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].email).toBe('akan-disuspend@example.com');
    });
  });

  describe('POST /api/users (admin create)', () => {
    it('tanpa permission user:create -> 403', async () => {
      const { accessToken } = await registerAndLogin(app, {
        email: 'nopermission2@example.com',
        password: 'password123',
      });

      await authed(api().post('/api/users'), accessToken)
        .send({ email: 'dibuatadmin@example.com', password: 'password123' })
        .expect(403);
    });

    it('sukses -> 201, user baru langsung bisa login dengan password yang dikirim', async () => {
      const admin = await createAdmin('admin3@example.com', ['user:create']);

      const res = await authed(api().post('/api/users'), admin.accessToken)
        .send({
          email: 'dibuatadmin@example.com',
          password: 'password123',
          fullName: 'Dibuat Admin',
        })
        .expect(201);

      expect(res.body.data.passwordHash).toBeUndefined();

      // Bukti paling meyakinkan bahwa password ke-hash dengan benar:
      // langsung coba login pakai kredensial yang barusan dikirim ke
      // endpoint create, bukan cuma cek 201 dan berhenti di situ.
      await api()
        .post('/api/auth/login')
        .send({ email: 'dibuatadmin@example.com', password: 'password123' })
        .expect(200);
    });

    it('email sudah terdaftar -> 409', async () => {
      const admin = await createAdmin('admin4@example.com', ['user:create']);
      await authed(api().post('/api/users'), admin.accessToken)
        .send({ email: 'duplikat@example.com', password: 'password123' })
        .expect(201);

      await authed(api().post('/api/users'), admin.accessToken)
        .send({ email: 'duplikat@example.com', password: 'password456' })
        .expect(409);
    });

    it('tercatat di audit log sebagai user.create dengan admin sebagai actor', async () => {
      const admin = await createAdmin('admin5@example.com', ['user:create']);
      const created = await authed(api().post('/api/users'), admin.accessToken)
        .send({ email: 'diaudit@example.com', password: 'password123' })
        .expect(201);

      const log = await db.query.auditLogs.findFirst({
        where: eq(auditLogs.action, 'user.create'),
      });

      expect(log).toBeDefined();
      expect(log?.actorUserId).toBe(admin.user.id);
      // resourceId di tabel audit_logs bertipe varchar (bisa menyimpan
      // ID resource apa pun, bukan cuma user -- lihat audit-logs.schema.ts),
      // jadi Drizzle selalu mengembalikannya sebagai string walau yang
      // disimpan aslinya angka. String() di sini, BUKAN Number(log?.resourceId),
      // supaya arah konversinya sama seperti yang terjadi di AuditLogService.record()
      // sungguhan (number -> string), bukan ditebak dari sisi test.
      expect(log?.resourceId).toBe(String(created.body.data.id));
    });
  });

  describe('PATCH /api/users/:id/suspend & /reactivate', () => {
    it('tanpa permission user:manage-status -> 403', async () => {
      const { accessToken } = await registerAndLogin(app, {
        email: 'nopermission3@example.com',
        password: 'password123',
      });

      await authed(api().patch('/api/users/1/suspend'), accessToken).expect(
        403,
      );
    });

    it('suspend sukses -> user tidak bisa login lagi (401 "Akun tidak aktif")', async () => {
      const admin = await createAdmin('admin6@example.com', [
        'user:manage-status',
      ]);
      const target = await registerAndLogin(app, {
        email: 'akandisuspend2@example.com',
        password: 'password123',
      });

      await authed(
        api().patch(`/api/users/${target.user.id}/suspend`),
        admin.accessToken,
      ).expect(200);

      const res = await api()
        .post('/api/auth/login')
        .send({ email: 'akandisuspend2@example.com', password: 'password123' })
        .expect(401);
      expect(res.body.message).toBe('Akun tidak aktif');
    });

    it('tidak bisa suspend akun sendiri -> 409', async () => {
      const admin = await createAdmin('admin7@example.com', [
        'user:manage-status',
      ]);

      await authed(
        api().patch(`/api/users/${admin.user.id}/suspend`),
        admin.accessToken,
      ).expect(409);
    });

    it('user tidak ditemukan -> 404', async () => {
      const admin = await createAdmin('admin8@example.com', [
        'user:manage-status',
      ]);

      await authed(
        api().patch('/api/users/999999/suspend'),
        admin.accessToken,
      ).expect(404);
    });

    it('reactivate sukses -> user bisa login lagi', async () => {
      const admin = await createAdmin('admin9@example.com', [
        'user:manage-status',
      ]);
      const target = await registerAndLogin(app, {
        email: 'suspendlalureaktivasi@example.com',
        password: 'password123',
      });

      await authed(
        api().patch(`/api/users/${target.user.id}/suspend`),
        admin.accessToken,
      ).expect(200);
      await authed(
        api().patch(`/api/users/${target.user.id}/reactivate`),
        admin.accessToken,
      ).expect(200);

      await api()
        .post('/api/auth/login')
        .send({
          email: 'suspendlalureaktivasi@example.com',
          password: 'password123',
        })
        .expect(200);
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('tanpa permission user:delete -> 403', async () => {
      const { accessToken } = await registerAndLogin(app, {
        email: 'nopermission4@example.com',
        password: 'password123',
      });

      await authed(api().delete('/api/users/1'), accessToken).expect(403);
    });

    it('sukses -> 200, user hilang dari GET list & tidak bisa login (soft delete)', async () => {
      const admin = await createAdmin('admin10@example.com', [
        'user:read',
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

      const list = await authed(
        api().get('/api/users'),
        admin.accessToken,
      ).expect(200);
      expect(
        list.body.data.find((u: { id: number }) => u.id === target.user.id),
      ).toBeUndefined();

      await api()
        .post('/api/auth/login')
        .send({ email: 'akandihapus@example.com', password: 'password123' })
        .expect(401);
    });

    it('tidak bisa menghapus akun sendiri -> 409', async () => {
      const admin = await createAdmin('admin11@example.com', ['user:delete']);

      await authed(
        api().delete(`/api/users/${admin.user.id}`),
        admin.accessToken,
      ).expect(409);
    });

    it('user yang sudah dihapus tidak bisa direaktivasi -> 404', async () => {
      const admin = await createAdmin('admin12@example.com', [
        'user:delete',
        'user:manage-status',
      ]);
      const target = await registerAndLogin(app, {
        email: 'hapuslalureaktivasi@example.com',
        password: 'password123',
      });

      await authed(
        api().delete(`/api/users/${target.user.id}`),
        admin.accessToken,
      ).expect(200);

      await authed(
        api().patch(`/api/users/${target.user.id}/reactivate`),
        admin.accessToken,
      ).expect(404);
    });
  });
});
