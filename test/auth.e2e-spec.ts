import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { createTestApp, closeTestApp } from './utils/create-test-app';
import { cleanDatabase } from './utils/db-cleanup';
import {
  extractRefreshCookie,
  type RegisterInput,
} from './utils/auth-test.util';
import { DRIZZLE, DrizzleDb } from '../src/database/database.constants';
import { users } from '../src/database/schema';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let db: DrizzleDb;

  const validUser: RegisterInput = {
    email: 'budi@example.com',
    password: 'password123',
    fullName: 'Budi Santoso',
  };

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

  describe('POST /api/auth/register', () => {
    it('sukses -> 201, response TIDAK mengandung passwordHash', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validUser)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({ email: validUser.email });
      expect(res.body.data.id).toEqual(expect.any(Number));
      expect(res.body.data.passwordHash).toBeUndefined();
      // fullName ada di tabel `profiles`, BUKAN `users` -- response
      // register() cuma sanitize() row `users`, jadi fullName memang
      // tidak ikut muncul di sini (bukan bug).
      expect(res.body.data.fullName).toBeUndefined();
    });

    it('menolak email yang sudah terdaftar -> 409', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validUser)
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validUser)
        .expect(409);

      expect(res.body.success).toBe(false);
    });

    it('menolak format email invalid -> 400', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...validUser, email: 'bukan-email' })
        .expect(400);
    });

    it('menolak password kurang dari 8 karakter -> 400', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...validUser, password: 'short' })
        .expect(400);
    });

    it('menolak field yang tidak dikenal -> 400 (whitelist + forbidNonWhitelisted di ValidationPipe)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...validUser, isAdmin: true })
        .expect(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validUser)
        .expect(201);
    });

    it('sukses -> 200, accessToken + user (tanpa passwordHash) + cookie refresh_token httpOnly di path /api/auth', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: validUser.email, password: validUser.password })
        .expect(200);

      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.user.email).toBe(validUser.email);
      expect(res.body.data.user.passwordHash).toBeUndefined();
      // refreshToken SENGAJA tidak boleh bocor di body (lihat komentar di auth.controller.ts)
      expect(res.body.data.refreshToken).toBeUndefined();

      const refreshCookie = extractRefreshCookie(res);
      const fullSetCookie = (
        res.headers['set-cookie'] as unknown as string[]
      ).find((c) => c.startsWith('refresh_token='));
      expect(refreshCookie).toMatch(/^refresh_token=.+/);
      expect(fullSetCookie).toMatch(/HttpOnly/);
      expect(fullSetCookie).toMatch(/Path=\/api\/auth/);
    });

    it('password salah -> 401 dengan pesan generik', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: validUser.email, password: 'salahbanget' })
        .expect(401);

      expect(res.body.message).toBe('Email atau password salah');
    });

    it('email tidak terdaftar -> 401 dengan pesan generik YANG SAMA (anti user-enumeration)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'tidak-ada@example.com', password: 'apapun123' })
        .expect(401);

      expect(res.body.message).toBe('Email atau password salah');
    });

    it('akun nonaktif -> 401 "Akun tidak aktif"', async () => {
      await db
        .update(users)
        .set({ isActive: false })
        .where(eq(users.email, validUser.email));

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: validUser.email, password: validUser.password })
        .expect(401);

      expect(res.body.message).toBe('Akun tidak aktif');
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshCookie: string;

    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validUser)
        .expect(201);
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: validUser.email, password: validUser.password })
        .expect(200);
      refreshCookie = extractRefreshCookie(loginRes);
    });

    it('sukses -> accessToken baru + cookie refresh_token BARU (rotasi, beda dari sebelumnya)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(200);

      expect(res.body.data.accessToken).toEqual(expect.any(String));

      const rotatedCookie = extractRefreshCookie(res);
      expect(rotatedCookie).not.toBe(refreshCookie);
    });

    it('tanpa cookie sama sekali -> 401 "Refresh token tidak ditemukan"', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .expect(401);

      expect(res.body.message).toBe('Refresh token tidak ditemukan');
    });

    it('token asal/tidak dikenal -> 401', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=token-ngasal-yang-gaada')
        .expect(401);
    });

    it('reuse token LAMA setelah rotasi -> 401, DAN token BARU hasil rotasi ikut ke-revoke (theft-detection)', async () => {
      // Rotasi pertama: sukses, dapat token baru.
      const firstRefresh = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(200);
      const rotatedCookie = extractRefreshCookie(firstRefresh);

      // Pakai lagi token LAMA yang sudah di-revoke oleh rotasi di atas --
      // ini pola "refresh token reuse" yang mengindikasikan token dicuri.
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(401);

      // Efek theft-detection (lihat RefreshTokensService.rotate()): SEMUA
      // sesi user ini langsung di-revoke, termasuk token BARU hasil
      // rotasi tadi -- bukan cuma token lama yang di-reuse.
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', rotatedCookie)
        .expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    let refreshCookie: string;

    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validUser)
        .expect(201);
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: validUser.email, password: validUser.password })
        .expect(200);
      refreshCookie = extractRefreshCookie(loginRes);
    });

    it('sukses -> refresh token yang dipakai logout jadi tidak valid lagi', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', refreshCookie)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(401);
    });

    it('idempotent: dipanggil tanpa cookie tetap 200, bukan error', async () => {
      await request(app.getHttpServer()).post('/api/auth/logout').expect(200);
    });
  });
});
