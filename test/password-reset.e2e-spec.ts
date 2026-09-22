import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { createTestApp, closeTestApp } from './utils/create-test-app';
import { cleanDatabase } from './utils/db-cleanup';
import { registerAndLogin } from './utils/auth-test.util';
import { DRIZZLE, DrizzleDb } from '../src/database/database.constants';
import { auditLogs, passwordResetTokens, users } from '../src/database/schema';
import { MailService } from '../src/modules/mail/mail.service';

type MailServiceMock = { sendMail: jest.Mock };

/**
 * Token mentah TIDAK PERNAH disimpan di DB (cuma hash-nya, lihat
 * password-reset-tokens.schema.ts) -- satu-satunya tempat token mentah
 * "terlihat" adalah isi email yang dikirim. Karena MailService di-mock
 * (lihat create-test-app.ts), cara test ini mendapat token yang valid
 * untuk dipakai adalah membongkar argumen panggilan mock-nya, PERSIS
 * seperti developer sungguhan yang harus buka Maildev/inbox untuk
 * menyalin token dari link di email.
 */
function extractResetToken(mock: MailServiceMock): string {
  const lastCall = mock.sendMail.mock.calls.at(-1);
  const html = lastCall?.[0]?.html as string | undefined;
  const match = html?.match(/token=([a-f0-9]{64})/);
  if (!match) {
    throw new Error(
      'Tidak menemukan token di html email terakhir -- pastikan forgot-password sudah dipanggil untuk email yang terdaftar & aktif.',
    );
  }
  return match[1];
}

describe('Forgot/Reset Password (e2e)', () => {
  let app: INestApplication<App>;
  let db: DrizzleDb;
  let mailServiceMock: MailServiceMock;

  const api = () => request(app.getHttpServer());

  /**
   * WAJIB dipakai (bukan registerAndLogin() langsung) di seluruh file
   * ini -- sejak fitur verifikasi email ada, register() JUGA memicu
   * sendMail() (email verifikasi). File ini cuma peduli pada perilaku
   * mail dari forgot-password/reset-password, jadi efek samping
   * registrasi itu langsung dibersihkan supaya tidak ikut kehitung di
   * assertion toHaveBeenCalledTimes()/not.toHaveBeenCalled() di bawah.
   */
  async function registerAndLoginQuiet(
    ...args: Parameters<typeof registerAndLogin>
  ) {
    const session = await registerAndLogin(...args);
    mailServiceMock.sendMail.mockClear();
    return session;
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get<DrizzleDb>(DRIZZLE);
    mailServiceMock = app.get(MailService);
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    // WAJIB -- app (dan mock-nya) dipakai bersama oleh SEMUA test case
    // di file ini (satu instance dari beforeAll), jadi riwayat panggilan
    // dari test sebelumnya harus dibersihkan supaya assertion
    // `toHaveBeenCalledTimes(1)` di tiap test tidak ikut menghitung
    // panggilan dari test lain.
    mailServiceMock.sendMail.mockClear();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  describe('POST /api/auth/forgot-password', () => {
    it('email terdaftar & aktif -> 200, MailService.sendMail terpanggil dengan link berisi token', async () => {
      await registerAndLoginQuiet(app, {
        email: 'lupapw@example.com',
        password: 'password123',
      });

      await api()
        .post('/api/auth/forgot-password')
        .send({ email: 'lupapw@example.com' })
        .expect(200);

      expect(mailServiceMock.sendMail).toHaveBeenCalledTimes(1);
      const call = mailServiceMock.sendMail.mock.calls[0][0];
      expect(call.to).toBe('lupapw@example.com');
      expect(call.html).toContain('/reset-password?token=');
    });

    /**
     * INI TEST PALING PENTING di describe block ini -- membuktikan
     * anti-enumeration bukan cuma "pesannya kebetulan sama" tapi
     * BENAR-BENAR tidak ada perlakuan beda di belakang layar antara
     * email terdaftar vs tidak (lihat juga pertanyaan yang sama waktu
     * uji manual: response 200 untuk keduanya TIDAK cukup buat
     * membuktikan ini, harus dicek sendMail-nya).
     */
    it('email TIDAK terdaftar -> 200 juga (anti-enumeration), MailService.sendMail TIDAK terpanggil', async () => {
      await api()
        .post('/api/auth/forgot-password')
        .send({ email: 'tidak-ada@example.com' })
        .expect(200);

      expect(mailServiceMock.sendMail).not.toHaveBeenCalled();
    });

    it('akun nonaktif (suspended) -> 200, MailService.sendMail TIDAK terpanggil', async () => {
      const { user } = await registerAndLoginQuiet(app, {
        email: 'nonaktif@example.com',
        password: 'password123',
      });
      // Manipulasi DB langsung (bukan lewat PATCH /users/:id/suspend) --
      // test ini fokus ke perilaku forgot-password terhadap akun
      // nonaktif, bukan menguji ulang alur suspend itu sendiri (sudah
      // dites di users.e2e-spec.ts).
      await db
        .update(users)
        .set({ isActive: false })
        .where(eq(users.id, user.id));

      await api()
        .post('/api/auth/forgot-password')
        .send({ email: 'nonaktif@example.com' })
        .expect(200);

      expect(mailServiceMock.sendMail).not.toHaveBeenCalled();
    });

    it('tercatat di audit log sebagai password_reset.requested, HANYA untuk email yang match', async () => {
      const { user } = await registerAndLoginQuiet(app, {
        email: 'diauditreset@example.com',
        password: 'password123',
      });

      await api()
        .post('/api/auth/forgot-password')
        .send({ email: 'diauditreset@example.com' })
        .expect(200);
      await api()
        .post('/api/auth/forgot-password')
        .send({ email: 'tidak-ada-2@example.com' })
        .expect(200);

      const logs = await db.query.auditLogs.findMany({
        where: eq(auditLogs.action, 'password_reset.requested'),
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].actorUserId).toBe(user.id);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('token valid -> 200, login pakai password baru sukses, password lama gagal', async () => {
      await registerAndLoginQuiet(app, {
        email: 'resetsukses@example.com',
        password: 'passwordLama123',
      });
      await api()
        .post('/api/auth/forgot-password')
        .send({ email: 'resetsukses@example.com' })
        .expect(200);
      const token = extractResetToken(mailServiceMock);

      await api()
        .post('/api/auth/reset-password')
        .send({ token, newPassword: 'passwordBaru456' })
        .expect(200);

      await api()
        .post('/api/auth/login')
        .send({ email: 'resetsukses@example.com', password: 'passwordBaru456' })
        .expect(200);
      await api()
        .post('/api/auth/login')
        .send({ email: 'resetsukses@example.com', password: 'passwordLama123' })
        .expect(401);
    });

    it('token yang sama dipakai dua kali -> kedua kalinya 400 (sekali pakai)', async () => {
      await registerAndLoginQuiet(app, {
        email: 'tokensekalipakai@example.com',
        password: 'password123',
      });
      await api()
        .post('/api/auth/forgot-password')
        .send({ email: 'tokensekalipakai@example.com' })
        .expect(200);
      const token = extractResetToken(mailServiceMock);

      await api()
        .post('/api/auth/reset-password')
        .send({ token, newPassword: 'passwordBaru456' })
        .expect(200);

      const res = await api()
        .post('/api/auth/reset-password')
        .send({ token, newPassword: 'passwordLainnya789' })
        .expect(400);
      expect(res.body.message).toContain('kedaluwarsa');
    });

    it('token sudah kedaluwarsa -> 400', async () => {
      const { user } = await registerAndLoginQuiet(app, {
        email: 'tokenkedaluwarsa@example.com',
        password: 'password123',
      });
      await api()
        .post('/api/auth/forgot-password')
        .send({ email: 'tokenkedaluwarsa@example.com' })
        .expect(200);
      const token = extractResetToken(mailServiceMock);

      // Mundurkan expiresAt jadi masa lalu -- cara satu-satunya untuk
      // menguji kedaluwarsa tanpa benar-benar menunggu 30 menit asli.
      await db
        .update(passwordResetTokens)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(passwordResetTokens.userId, user.id));

      await api()
        .post('/api/auth/reset-password')
        .send({ token, newPassword: 'passwordBaru456' })
        .expect(400);
    });

    it('token tidak dikenal (asal ketik) -> 400', async () => {
      await api()
        .post('/api/auth/reset-password')
        .send({ token: 'a'.repeat(64), newPassword: 'passwordBaru456' })
        .expect(400);
    });

    it('berhasil reset -> SEMUA sesi lama ikut ter-revoke (refresh token lama tidak bisa dipakai lagi)', async () => {
      const session = await registerAndLoginQuiet(app, {
        email: 'sesilamaterrevoke@example.com',
        password: 'passwordLama123',
      });

      await api()
        .post('/api/auth/forgot-password')
        .send({ email: 'sesilamaterrevoke@example.com' })
        .expect(200);
      const token = extractResetToken(mailServiceMock);
      await api()
        .post('/api/auth/reset-password')
        .send({ token, newPassword: 'passwordBaru456' })
        .expect(200);

      await api()
        .post('/api/auth/refresh')
        .set('Cookie', session.refreshCookie)
        .expect(401);
    });

    it('tercatat di audit log sebagai password_reset.completed', async () => {
      const { user } = await registerAndLoginQuiet(app, {
        email: 'diauditcompleted@example.com',
        password: 'password123',
      });
      await api()
        .post('/api/auth/forgot-password')
        .send({ email: 'diauditcompleted@example.com' })
        .expect(200);
      const token = extractResetToken(mailServiceMock);

      await api()
        .post('/api/auth/reset-password')
        .send({ token, newPassword: 'passwordBaru456' })
        .expect(200);

      const log = await db.query.auditLogs.findFirst({
        where: eq(auditLogs.action, 'password_reset.completed'),
      });
      expect(log).toBeDefined();
      expect(log?.actorUserId).toBe(user.id);
    });
  });
});
