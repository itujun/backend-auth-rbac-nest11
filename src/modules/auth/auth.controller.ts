import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RefreshResponseDto } from './dto/refresh-response.dto';
import { Public } from '../../common/decorators/public.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ApiStandardResponse } from '../../common/swagger/api-standard-response.decorator';
import { SWAGGER_BEARER_AUTH_NAME } from '../../config/swagger.config';
import { CurrentUser } from './decorators/current-user.decorator';
import type { SafeUser } from '../users/types/safe-user.type';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { RefreshCookieHelper } from './utils/refresh-cookie.helper';

/**
 * Limit khusus untuk endpoint rawan brute-force/credential-stuffing.
 * Lebih ketat dari default global (lihat `throttle.limit`/`throttle.ttlMs`
 * di configuration.ts).
 *
 * SENGAJA hardcoded di sini, bukan dibaca dari ConfigService seperti
 * limit global: `@Throttle()` adalah decorator, nilainya di-resolve saat
 * class DIDEFINISIKAN (load time), jauh sebelum Nest membuat instance
 * `ConfigService` lewat dependency injection saat runtime. Kalau memang
 * perlu configurable per environment, alternatifnya pakai custom
 * `ThrottlerGuard` yang override `getTracker()`/`getLimit()` — di luar
 * scope latihan ini.
 */
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

/** Sedikit lebih longgar dari AUTH_THROTTLE — refresh wajar dipanggil
 * lebih sering oleh client legit (mis. beberapa tab browser sekaligus). */
const REFRESH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly refreshCookieHelper: RefreshCookieHelper,
  ) {}

  private requestMeta(req: Request) {
    return {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };
  }

  @Public()
  @Post('register')
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Registrasi user baru',
    description: 'Otomatis membuat profile kosong via transaction.',
  })
  @ApiStandardResponse(UserResponseDto, {
    status: 201,
    description: 'Registrasi berhasil',
  })
  @ApiConflictResponse({ description: 'Email sudah terdaftar' })
  @ApiTooManyRequestsResponse({
    description: 'Terlalu banyak percobaan, coba lagi nanti (maks 5/menit)',
  })
  @ResponseMessage('Registrasi berhasil')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, this.requestMeta(req));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK) // default NestJS untuk POST adalah 201, login lebih tepat 200
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Login',
    description:
      'refreshToken dikirim via httpOnly cookie (path /api/auth), TIDAK ' +
      'ikut di body response.',
  })
  @ApiStandardResponse(LoginResponseDto, { description: 'Login berhasil' })
  @ApiUnauthorizedResponse({
    description: 'Email/password salah, atau akun tidak aktif',
  })
  @ApiTooManyRequestsResponse({
    description: 'Terlalu banyak percobaan, coba lagi nanti (maks 5/menit)',
  })
  @ResponseMessage('Login berhasil')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, this.requestMeta(req));

    this.refreshCookieHelper.set(
      res,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );

    // refreshToken SENGAJA tidak diikutkan di body response — cuma
    // lewat httpOnly cookie, supaya tidak bisa diakses/dicuri lewat JS.
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle(REFRESH_THROTTLE)
  @ApiOperation({
    summary: 'Perbarui access token',
    description:
      'Butuh refresh token cookie (bukan header) — rotasi otomatis, ' +
      'token lama langsung di-revoke.',
  })
  @ApiStandardResponse(RefreshResponseDto, {
    description: 'Token berhasil diperbarui',
  })
  @ApiUnauthorizedResponse({
    description:
      'Refresh token tidak ada / invalid / kadaluarsa / sudah dipakai',
  })
  @ApiTooManyRequestsResponse({
    description: 'Terlalu banyak percobaan, coba lagi nanti (maks 10/menit)',
  })
  @ResponseMessage('Token berhasil diperbarui')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = this.refreshCookieHelper.extractFromRequest(
      req.cookies as Record<string, string | undefined>,
    );

    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token tidak ditemukan');
    }

    const result = await this.authService.refresh(
      rawRefreshToken,
      this.requestMeta(req),
    );

    this.refreshCookieHelper.set(
      res,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );

    return { accessToken: result.accessToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout (device saat ini)',
    description:
      'Idempotent — tetap sukses walau cookie tidak ada/sudah invalid.',
  })
  @ApiResponse({ status: 200, description: 'Logout berhasil' })
  @ResponseMessage('Logout berhasil')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = this.refreshCookieHelper.extractFromRequest(
      req.cookies as Record<string, string | undefined>,
    );

    // Logout bersifat idempotent: kalau cookie tidak ada/sudah invalid,
    // tetap dianggap sukses (client memang jadi "logged out").
    if (rawRefreshToken) {
      await this.authService.logout(rawRefreshToken, this.requestMeta(req));
    }

    this.refreshCookieHelper.clear(res);
    return null;
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth(SWAGGER_BEARER_AUTH_NAME)
  @ApiOperation({ summary: 'Logout dari SEMUA device/sesi' })
  @ApiResponse({ status: 200, description: 'Semua sesi berhasil di-logout' })
  @ApiUnauthorizedResponse({ description: 'Access token tidak ada/invalid' })
  @ResponseMessage('Semua sesi berhasil di-logout')
  async logoutAll(
    @CurrentUser() user: SafeUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(user.id, this.requestMeta(req));
    this.refreshCookieHelper.clear(res);
    return null;
  }

  @Get('me')
  @ApiBearerAuth(SWAGGER_BEARER_AUTH_NAME)
  @ApiOperation({ summary: 'Profil user yang sedang login' })
  @ApiStandardResponse(UserResponseDto, {
    description: 'Profil user berhasil diambil',
  })
  @ApiUnauthorizedResponse({ description: 'Access token tidak ada/invalid' })
  @ResponseMessage('Profil user berhasil diambil')
  me(@CurrentUser() user: SafeUser) {
    return user;
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Minta link reset password',
    description:
      'SELALU balas pesan sukses yang sama, terlepas email terdaftar ' +
      'atau tidak (anti user-enumeration). Link dikirim ke email kalau ' +
      'memang terdaftar & akun aktif.',
  })
  @ApiResponse({ status: 200, description: 'Permintaan diterima' })
  @ApiTooManyRequestsResponse({
    description: 'Terlalu banyak percobaan, coba lagi nanti (maks 5/menit)',
  })
  @ResponseMessage(
    'Kalau email tersebut terdaftar, link reset password sudah dikirim',
  )
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.authService.forgotPassword(dto, this.requestMeta(req));
    return null;
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Atur password baru pakai token dari email',
    description:
      'Token sekali pakai, berlaku singkat (default 30 menit). Semua ' +
      'sesi/device lama otomatis di-logout setelah berhasil.',
  })
  @ApiResponse({ status: 200, description: 'Password berhasil diubah' })
  @ApiResponse({
    status: 400,
    description: 'Token tidak valid, sudah dipakai, atau sudah kedaluwarsa',
  })
  @ApiTooManyRequestsResponse({
    description: 'Terlalu banyak percobaan, coba lagi nanti (maks 5/menit)',
  })
  @ResponseMessage('Password berhasil diubah, silakan login ulang')
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    await this.authService.resetPassword(dto, this.requestMeta(req));
    return null;
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Verifikasi email pakai token dari link registrasi',
    description:
      'Token sekali pakai, default berlaku 24 jam. Tidak memblokir ' +
      'login -- status ini murni informasional (lihat catatan desain).',
  })
  @ApiResponse({ status: 200, description: 'Email berhasil diverifikasi' })
  @ApiResponse({
    status: 400,
    description: 'Token tidak valid, sudah dipakai, atau sudah kedaluwarsa',
  })
  @ApiTooManyRequestsResponse({
    description: 'Terlalu banyak percobaan, coba lagi nanti (maks 5/menit)',
  })
  @ResponseMessage('Email berhasil diverifikasi')
  async verifyEmail(@Body() dto: VerifyEmailDto, @Req() req: Request) {
    await this.authService.verifyEmail(dto, this.requestMeta(req));
    return null;
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Kirim ulang link verifikasi email',
    description:
      'SELALU balas pesan sukses yang sama, terlepas email terdaftar, ' +
      'sudah terverifikasi, atau tidak (anti user-enumeration) -- pola ' +
      'sama persis dengan forgot-password.',
  })
  @ApiResponse({ status: 200, description: 'Permintaan diterima' })
  @ApiTooManyRequestsResponse({
    description: 'Terlalu banyak percobaan, coba lagi nanti (maks 5/menit)',
  })
  @ResponseMessage(
    'Kalau email tersebut terdaftar dan belum terverifikasi, link baru sudah dikirim',
  )
  async resendVerification(
    @Body() dto: ResendVerificationDto,
    @Req() req: Request,
  ) {
    await this.authService.resendVerification(dto, this.requestMeta(req));
    return null;
  }
}
