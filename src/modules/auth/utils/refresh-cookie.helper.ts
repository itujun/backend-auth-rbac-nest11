import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';

/**
 * Semua endpoint yang berurusan dengan refresh token cookie (login,
 * refresh, logout, logout-all) HARUS pakai opsi cookie yang identik,
 * terutama `path` — kalau tidak, browser akan menganggap itu cookie
 * yang berbeda dan gagal clear/overwrite cookie yang lama.
 * Disentralisasi di sini supaya tidak ada opsi yang miss-match (DRY).
 */
@Injectable()
export class RefreshCookieHelper {
  constructor(private readonly configService: ConfigService) {}

  private get cookieName(): string {
    return this.configService.get<string>('cookie.refreshTokenName') as string;
  }

  private get isProduction(): boolean {
    return this.configService.get<string>('app.env') === 'production';
  }

  /** Cookie hanya dikirim browser untuk request ke /api/auth/* — tidak perlu ikut di semua request. */
  private get cookiePath(): string {
    return '/api/auth';
  }

  set(res: Response, rawToken: string, expiresAt: Date): void {
    res.cookie(this.cookieName, rawToken, {
      httpOnly: true, // tidak bisa diakses JS di browser -> mitigasi XSS
      secure: this.isProduction, // wajib HTTPS di production
      sameSite: 'lax', // cukup untuk setup frontend terpisah di localhost (same-site secara spek browser)
      path: this.cookiePath,
      expires: expiresAt,
    });
  }

  clear(res: Response): void {
    res.clearCookie(this.cookieName, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: this.cookiePath,
    });
  }

  extractFromRequest(
    cookies: Record<string, string | undefined>,
  ): string | undefined {
    return cookies[this.cookieName];
  }
}
