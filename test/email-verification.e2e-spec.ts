import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { createTestApp, closeTestApp } from './utils/create-test-app';
import { cleanDatabase } from './utils/db-cleanup';
import { registerAndLogin } from './utils/auth-test.util';
import { DRIZZLE, DrizzleDb } from '../src/database/database.constants';
import { auditLogs, users } from '../src/database/schema';
import { MailService } from '../src/modules/mail/mail.service';

type MailServiceMock = { sendMail: jest.Mock };

/**
 * Sama alasannya dengan extractResetToken() di password-reset.e2e-spec.ts
 * -- token mentah cuma "terlihat" di isi email yang dikirim, karena
 * MailService di-mock. `callIndex` (default: panggilan TERAKHIR) dipakai
 * saat satu test butuh membedakan token dari register() vs token dari
 * resend-verification() -- dua email berbeda, dua token berbeda.
 */
function extractVerifyToken(mock: MailServiceMock, callIndex = -1): string {
  const call =
    callIndex === -1
      ? mock.sendMail.mock.calls.at(-1)
      : mock.sendMail.mock.calls[callIndex];
  const html = call?.[0]?.html as string | undefined;
  const match = html?.match(/token=([a-f0-9]{64})/);
  if (!match) {
    throw new Error(
      `Tidak menemukan token di panggilan sendMail ke-${callIndex} -- pastikan email verifikasi sudah terkirim.`,
    );
  }
  return match[1];
}

describe('Email Verification (e2e)', () => {
  let app: INestApplication<App>;
  let db: DrizzleDb;
  let mailServiceMock: MailServiceMock;

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get<DrizzleDb>(DRIZZLE);
    mailServiceMock = app.get(MailService) as unknown as MailServiceMock;
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    mailServiceMock.sendMail.mockClear();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  describe('POST /api/auth/register (efek ke verifikasi email)', () => {
    it('register otomatis mengirim email verifikasi berisi token', async () => {
      await api()
        .post('/api/auth/register')
        .send({ email: 'daftarbaru@example.com', password: 'password123' })
        .expect(201);

      expect(mailServiceMock.sendMail).toHaveBeenCalledTimes(1);
      const call = mailServiceMock.sendMail.mock.calls[0][0];
      expect(call.to).toBe('daftarbaru@example.com');
      expect(call.subject).toContain('Verifikasi Email');
      expect(call.html).toContain('/verify-email?token=');
    });

    it('Opsi B: user yang belum verifikasi TETAP bisa login (tidak diblokir)', async () => {
      await api()
        .post('/api/auth/register')
        .send({ email: 'belumverif@example.com', password: 'password123' })
        .expect(201);

      const res = await api()
        .post('/api/auth/login')
        .send({ email: 'belumverif@example.com', password: 'password123' })
        .expect(200);

      expect(res.body.data.user.emailVerifiedAt).toBeNull();
    });
  });

  describe('POST /api/auth/verify-email', () => {
    it('token valid -> 200, emailVerifiedAt terisi', async () => {
      await api()
        .post('/api/auth/register')
        .send({ email: 'verifsukses@example.com', password: 'password123' })
        .expect(201);
      const token = extractVerifyToken(mailServiceMock);

      await api().post('/api/auth/verify-email').send({ token }).expect(200);

      const loginRes = await api()
        .post('/api/auth/login')
        .send({ email: 'verifsukses@example.com', password: 'password123' })
        .expect(200);
      expect(loginRes.body.data.user.emailVerifiedAt).not.toBeNull();
    });

    it('token yang sama dipakai dua kali -> kedua kalinya 400 (sekali pakai)', async () => {
      await api()
        .post('/api/auth/register')
        .send({
          email: 'tokensekalipakai2@example.com',
          password: 'password123',
        })
        .expect(201);
      const token = extractVerifyToken(mailServiceMock);

      await api().post('/api/auth/verify-email').send({ token }).expect(200);

      const res = await api()
        .post('/api/auth/verify-email')
        .send({ token })
        .expect(400);
      expect(res.body.message).toContain('kedaluwarsa');
    });

    it('token tidak dikenal (asal ketik) -> 400', async () => {
      await api()
        .post('/api/auth/verify-email')
        .send({ token: 'a'.repeat(64) })
        .expect(400);
    });

    it('tercatat di audit log sebagai email_verification.completed', async () => {
      const { user } = await registerAndLogin(app, {
        email: 'diauditverif@example.com',
        password: 'password123',
      });
      const token = extractVerifyToken(mailServiceMock);

      await api().post('/api/auth/verify-email').send({ token }).expect(200);

      const log = await db.query.auditLogs.findFirst({
        where: eq(auditLogs.action, 'email_verification.completed'),
      });
      expect(log).toBeDefined();
      expect(log?.actorUserId).toBe(user.id);
    });
  });

  describe('POST /api/auth/resend-verification', () => {
    it('email terdaftar & belum verifikasi -> 200, token BARU dikirim, token LAMA otomatis tidak valid', async () => {
      await api()
        .post('/api/auth/register')
        .send({ email: 'kirimulang@example.com', password: 'password123' })
        .expect(201);
      const oldToken = extractVerifyToken(mailServiceMock, 0);

      await api()
        .post('/api/auth/resend-verification')
        .send({ email: 'kirimulang@example.com' })
        .expect(200);

      expect(mailServiceMock.sendMail).toHaveBeenCalledTimes(2);
      const newToken = extractVerifyToken(mailServiceMock, 1);
      expect(newToken).not.toBe(oldToken);

      // Token lama sudah diinvalidasi (invalidateAllForUser di issue()
      // baru) -- bukti bahwa cuma SATU token aktif per user kapan pun.
      await api()
        .post('/api/auth/verify-email')
        .send({ token: oldToken })
        .expect(400);

      // Token baru masih valid & benar-benar memverifikasi.
      await api()
        .post('/api/auth/verify-email')
        .send({ token: newToken })
        .expect(200);
    });

    it('email TIDAK terdaftar -> 200 juga (anti-enumeration), sendMail TIDAK terpanggil', async () => {
      await api()
        .post('/api/auth/resend-verification')
        .send({ email: 'tidak-ada-verif@example.com' })
        .expect(200);

      expect(mailServiceMock.sendMail).not.toHaveBeenCalled();
    });

    it('email SUDAH terverifikasi -> 200 (pesan sama), sendMail TIDAK terpanggil lagi', async () => {
      await api()
        .post('/api/auth/register')
        .send({ email: 'sudahverif@example.com', password: 'password123' })
        .expect(201);
      const token = extractVerifyToken(mailServiceMock);
      await api().post('/api/auth/verify-email').send({ token }).expect(200);
      mailServiceMock.sendMail.mockClear();

      await api()
        .post('/api/auth/resend-verification')
        .send({ email: 'sudahverif@example.com' })
        .expect(200);

      expect(mailServiceMock.sendMail).not.toHaveBeenCalled();
    });

    it('akun nonaktif -> 200, sendMail TIDAK terpanggil', async () => {
      const { user } = await registerAndLogin(app, {
        email: 'nonaktifverif@example.com',
        password: 'password123',
      });
      await db
        .update(users)
        .set({ isActive: false })
        .where(eq(users.id, user.id));
      mailServiceMock.sendMail.mockClear();

      await api()
        .post('/api/auth/resend-verification')
        .send({ email: 'nonaktifverif@example.com' })
        .expect(200);

      expect(mailServiceMock.sendMail).not.toHaveBeenCalled();
    });

    it('tercatat di audit log sebagai email_verification.resent, HANYA untuk permintaan yang valid', async () => {
      const { user } = await registerAndLogin(app, {
        email: 'diauditresend@example.com',
        password: 'password123',
      });
      mailServiceMock.sendMail.mockClear();

      await api()
        .post('/api/auth/resend-verification')
        .send({ email: 'diauditresend@example.com' })
        .expect(200);
      await api()
        .post('/api/auth/resend-verification')
        .send({ email: 'tidak-ada-lagi@example.com' })
        .expect(200);

      const logs = await db.query.auditLogs.findMany({
        where: eq(auditLogs.action, 'email_verification.resent'),
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].actorUserId).toBe(user.id);
    });
  });
});
