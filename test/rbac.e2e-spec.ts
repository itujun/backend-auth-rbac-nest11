import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, closeTestApp } from './utils/create-test-app';
import { cleanDatabase } from './utils/db-cleanup';
import { registerAndLogin } from './utils/auth-test.util';
import {
  grantPermissionsToUser,
  ensurePermission,
} from './utils/rbac-test.util';

describe('RBAC (e2e)', () => {
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

  describe('Guard enforcement (JwtAuthGuard + PermissionsGuard)', () => {
    // Dites SEKALI lewat 1 endpoint representatif (GET /api/roles) --
    // JwtAuthGuard & PermissionsGuard adalah guard GLOBAL yang sama
    // dipakai di SEMUA endpoint ber-@RequirePermission, jadi cukup
    // dibuktikan jalan benar di satu tempat, tidak perlu diulang per
    // endpoint (lihat detail masing-masing endpoint di describe block
    // Roles/Permissions CRUD di bawah, yang mengasumsikan admin SUDAH
    // punya semua permission terkait).

    it('tanpa access token -> 401', async () => {
      await api().get('/api/roles').expect(401);
    });

    it('access token valid TAPI tanpa permission role:read -> 403, pesan sebut nama permission yang kurang', async () => {
      const { accessToken } = await registerAndLogin(app, {
        email: 'nopermission@example.com',
        password: 'password123',
      });

      const res = await authed(api().get('/api/roles'), accessToken).expect(
        403,
      );
      expect(res.body.message).toContain('role:read');
    });

    it('access token valid DENGAN permission role:read -> 200', async () => {
      const { accessToken, user } = await registerAndLogin(app, {
        email: 'haspermission@example.com',
        password: 'password123',
      });
      await grantPermissionsToUser(app, user.id, ['role:read']);

      await authed(api().get('/api/roles'), accessToken).expect(200);
    });
  });

  describe('Roles CRUD', () => {
    let accessToken: string;
    let adminUserId: number;

    beforeEach(async () => {
      const admin = await registerAndLogin(app, {
        email: 'roles-admin@example.com',
        password: 'password123',
      });
      accessToken = admin.accessToken;
      adminUserId = admin.user.id;
      // Full akses ke seluruh endpoint role -- bukan yang lagi diuji di
      // sini (itu tanggung jawab describe block "Guard enforcement" di
      // atas), jadi test-test di bawah murni fokus ke LOGIC BISNISNYA.
      await grantPermissionsToUser(app, adminUserId, [
        'role:create',
        'role:read',
        'role:update',
        'role:delete',
        'role:manage-permissions',
        'role:manage-users',
      ]);
    });

    it('create -> 201, response berisi id/name/description', async () => {
      const res = await authed(api().post('/api/roles'), accessToken)
        .send({ name: 'editor', description: 'Bisa edit konten' })
        .expect(201);

      expect(res.body.data).toMatchObject({
        name: 'editor',
        description: 'Bisa edit konten',
      });
      expect(res.body.data.id).toEqual(expect.any(Number));
    });

    it('menolak nama role yang sudah ada -> 409', async () => {
      await authed(api().post('/api/roles'), accessToken)
        .send({ name: 'editor' })
        .expect(201);

      await authed(api().post('/api/roles'), accessToken)
        .send({ name: 'editor' })
        .expect(409);
    });

    it('list dengan search -> hanya ketemu role yang cocok (tidak keganggu role admin sintetis dari helper)', async () => {
      await authed(api().post('/api/roles'), accessToken)
        .send({ name: 'unique-search-target' })
        .expect(201);
      await authed(api().post('/api/roles'), accessToken)
        .send({ name: 'lainnya' })
        .expect(201);

      const res = await authed(
        api().get('/api/roles?search=unique-search-target'),
        accessToken,
      ).expect(200);

      expect(res.body.meta.totalItems).toBe(1);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('unique-search-target');
    });

    it('get by id -> 200; id tidak ada -> 404', async () => {
      const created = await authed(api().post('/api/roles'), accessToken)
        .send({ name: 'viewer' })
        .expect(201);

      await authed(
        api().get(`/api/roles/${created.body.data.id as number}`),
        accessToken,
      )
        .expect(200)
        .expect((res) => {
          expect(res.body.data.name).toBe('viewer');
        });

      await authed(api().get('/api/roles/999999'), accessToken).expect(404);
    });

    it('update nama -> 200; update ke nama yang sudah dipakai role lain -> 409', async () => {
      const roleA = await authed(api().post('/api/roles'), accessToken)
        .send({ name: 'role-a' })
        .expect(201);
      await authed(api().post('/api/roles'), accessToken)
        .send({ name: 'role-b' })
        .expect(201);

      await authed(
        api().patch(`/api/roles/${roleA.body.data.id as number}`),
        accessToken,
      )
        .send({ name: 'role-a-renamed' })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.name).toBe('role-a-renamed');
        });

      await authed(
        api().patch(`/api/roles/${roleA.body.data.id as number}`),
        accessToken,
      )
        .send({ name: 'role-b' })
        .expect(409);
    });

    it('delete -> 200; role yang sudah dihapus tidak bisa diambil lagi (404)', async () => {
      const created = await authed(api().post('/api/roles'), accessToken)
        .send({ name: 'akan-dihapus' })
        .expect(201);
      const roleId = created.body.data.id as number;

      await authed(api().delete(`/api/roles/${roleId}`), accessToken).expect(
        200,
      );
      await authed(api().get(`/api/roles/${roleId}`), accessToken).expect(404);
    });

    describe('Sync permission ke role', () => {
      it('PUT /:id/permissions -> 200, GET /:id/permissions merefleksikan hasil sync', async () => {
        const role = await authed(api().post('/api/roles'), accessToken)
          .send({ name: 'role-dengan-permission' })
          .expect(201);
        const perm1 = await ensurePermission(app, 'article:read');
        const perm2 = await ensurePermission(app, 'article:write');

        const syncRes = await authed(
          api().put(`/api/roles/${role.body.data.id as number}/permissions`),
          accessToken,
        )
          .send({ permissionIds: [perm1.id, perm2.id] })
          .expect(200);
        expect(syncRes.body.data).toHaveLength(2);

        const listRes = await authed(
          api().get(`/api/roles/${role.body.data.id as number}/permissions`),
          accessToken,
        ).expect(200);
        const names = (listRes.body.data as Array<{ name: string }>).map(
          (p) => p.name,
        );
        expect(names.sort()).toEqual(['article:read', 'article:write']);
      });

      it('sync dengan permissionId yang tidak ada -> 404', async () => {
        const role = await authed(api().post('/api/roles'), accessToken)
          .send({ name: 'role-invalid-permission' })
          .expect(201);

        await authed(
          api().put(`/api/roles/${role.body.data.id as number}/permissions`),
          accessToken,
        )
          .send({ permissionIds: [999999] })
          .expect(404);
      });
    });

    describe('Assign/revoke role ke user', () => {
      it('assign -> 201; assign lagi ke user yang sama -> 409 (sudah punya)', async () => {
        const role = await authed(api().post('/api/roles'), accessToken)
          .send({ name: 'role-untuk-assign' })
          .expect(201);
        const target = await registerAndLogin(app, {
          email: 'target-assign@example.com',
          password: 'password123',
        });

        await authed(
          api().post(
            `/api/roles/${role.body.data.id as number}/users/${target.user.id}`,
          ),
          accessToken,
        ).expect(201);

        await authed(
          api().post(
            `/api/roles/${role.body.data.id as number}/users/${target.user.id}`,
          ),
          accessToken,
        ).expect(409);
      });

      it('list users role -> berisi user yang di-assign; revoke -> 200; revoke lagi -> 404', async () => {
        const role = await authed(api().post('/api/roles'), accessToken)
          .send({ name: 'role-untuk-revoke' })
          .expect(201);
        const target = await registerAndLogin(app, {
          email: 'target-revoke@example.com',
          password: 'password123',
        });
        const roleId = role.body.data.id as number;

        await authed(
          api().post(`/api/roles/${roleId}/users/${target.user.id}`),
          accessToken,
        ).expect(201);

        const listRes = await authed(
          api().get(`/api/roles/${roleId}/users`),
          accessToken,
        ).expect(200);
        expect(
          (listRes.body.data as Array<{ email: string }>).some(
            (u) => u.email === target.user.email,
          ),
        ).toBe(true);

        await authed(
          api().delete(`/api/roles/${roleId}/users/${target.user.id}`),
          accessToken,
        ).expect(200);

        await authed(
          api().delete(`/api/roles/${roleId}/users/${target.user.id}`),
          accessToken,
        ).expect(404);
      });
    });
  });

  describe('Permissions CRUD', () => {
    let accessToken: string;

    beforeEach(async () => {
      const admin = await registerAndLogin(app, {
        email: 'perms-admin@example.com',
        password: 'password123',
      });
      accessToken = admin.accessToken;
      await grantPermissionsToUser(app, admin.user.id, [
        'permission:create',
        'permission:read',
        'permission:update',
        'permission:delete',
      ]);
    });

    it('create -> 201, response berisi id/name', async () => {
      const res = await authed(api().post('/api/permissions'), accessToken)
        .send({ name: 'article:publish', description: 'Publish artikel' })
        .expect(201);

      expect(res.body.data).toMatchObject({
        name: 'article:publish',
        description: 'Publish artikel',
      });
    });

    it('menolak format nama yang bukan "resource:action" -> 400', async () => {
      await authed(api().post('/api/permissions'), accessToken)
        .send({ name: 'FormatSalah' })
        .expect(400);
    });

    it('menolak nama yang sudah ada -> 409', async () => {
      await authed(api().post('/api/permissions'), accessToken)
        .send({ name: 'article:archive' })
        .expect(201);

      await authed(api().post('/api/permissions'), accessToken)
        .send({ name: 'article:archive' })
        .expect(409);
    });

    it('get by id -> 200; tidak ada -> 404', async () => {
      const created = await authed(api().post('/api/permissions'), accessToken)
        .send({ name: 'article:comment' })
        .expect(201);

      await authed(
        api().get(`/api/permissions/${created.body.data.id as number}`),
        accessToken,
      ).expect(200);
      await authed(api().get('/api/permissions/999999'), accessToken).expect(
        404,
      );
    });

    it('update -> 200; update ke nama yang sudah dipakai permission lain -> 409', async () => {
      const permA = await authed(api().post('/api/permissions'), accessToken)
        .send({ name: 'article:like' })
        .expect(201);
      await authed(api().post('/api/permissions'), accessToken)
        .send({ name: 'article:share' })
        .expect(201);

      await authed(
        api().patch(`/api/permissions/${permA.body.data.id as number}`),
        accessToken,
      )
        .send({ description: 'Deskripsi baru' })
        .expect(200);

      await authed(
        api().patch(`/api/permissions/${permA.body.data.id as number}`),
        accessToken,
      )
        .send({ name: 'article:share' })
        .expect(409);
    });

    it('delete -> 200; sudah dihapus tidak bisa diambil lagi (404)', async () => {
      const created = await authed(api().post('/api/permissions'), accessToken)
        .send({ name: 'article:pin' })
        .expect(201);
      const id = created.body.data.id as number;

      await authed(api().delete(`/api/permissions/${id}`), accessToken).expect(
        200,
      );
      await authed(api().get(`/api/permissions/${id}`), accessToken).expect(
        404,
      );
    });
  });
});
