import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface RegisterInput {
  email: string;
  password: string;
  fullName?: string;
}

export interface RegisteredUser {
  id: number;
  email: string;
}

export interface LoggedInSession {
  accessToken: string;
  /** String cookie mentah siap pakai lewat `.set('Cookie', refreshCookie)` -- sudah termasuk nama & value, TANPA atribut (Path/HttpOnly/dll). */
  refreshCookie: string;
  user: RegisteredUser;
}

/**
 * Ambil cookie refresh token dari header `Set-Cookie` response login/refresh.
 *
 * 'refresh_token' di-hardcode sesuai DEFAULT `REFRESH_TOKEN_COOKIE_NAME`
 * (lihat env.validation.ts) -- global-setup.ts TIDAK meng-override env ini,
 * jadi default ini yang aktif di E2E.
 */
export function extractRefreshCookie(res: request.Response): string {
  const rawCookies = res.headers['set-cookie'] as unknown as
    string[] | undefined;
  const full = rawCookies?.find((c) => c.startsWith('refresh_token='));

  if (!full) {
    throw new Error(
      'refresh_token cookie tidak ditemukan di Set-Cookie header -- pastikan request ini benar memicu login/refresh.',
    );
  }

  // Set-Cookie penuh formatnya "refresh_token=xxx; Path=...; HttpOnly; ...".
  // Cuma bagian "refresh_token=xxx" yang perlu dikirim balik sebagai
  // request header `Cookie` di request berikutnya.
  return full.split(';')[0];
}

export async function registerUser(
  app: INestApplication,
  input: RegisterInput,
): Promise<RegisteredUser> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send(input)
    .expect(201);

  return res.body.data as RegisteredUser;
}

export async function loginUser(
  app: INestApplication,
  credentials: { email: string; password: string },
): Promise<LoggedInSession> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send(credentials)
    .expect(200);

  return {
    accessToken: res.body.data.accessToken as string,
    refreshCookie: extractRefreshCookie(res),
    user: res.body.data.user as RegisteredUser,
  };
}

/** Shortcut register + login sekaligus -- dipakai kebanyakan test yang cuma butuh "ada user yang sudah login", tanpa peduli detail proses register/login-nya sendiri. */
export async function registerAndLogin(
  app: INestApplication,
  input: RegisterInput,
): Promise<LoggedInSession> {
  await registerUser(app, input);
  return loginUser(app, { email: input.email, password: input.password });
}
