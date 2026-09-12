import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, closeTestApp } from './utils/create-test-app';
import { cleanDatabase } from './utils/db-cleanup';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  // beforeAll (bukan beforeEach) -- app cuma perlu dibuat SEKALI per file
  // test, bukan tiap `it()`. Bootstrap app (compile module + init) jauh
  // lebih mahal daripada truncate tabel, makanya cleanup state antar test
  // dipisah ke cleanDatabase() di beforeEach di bawah.
  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(app);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('GET /api/health -> 200, status ok, DB benar-benar terkoneksi ke Postgres Testcontainers', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as {
          success: boolean;
          data: { status: string; details: Record<string, unknown> };
        };
        // success: true & pembungkusan { success, message, data } ini
        // datang dari ResponseInterceptor -- kalau ini gagal, berarti
        // createTestApp() tidak benar-benar meniru pipeline main.ts.
        expect(body.success).toBe(true);
        expect(body.data.status).toBe('ok');
        expect(body.data.details.database).toMatchObject({ status: 'up' });
      });
  });
});
