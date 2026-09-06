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
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
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
  @ApiOperation({
    summary: 'Registrasi user baru',
    description: 'Otomatis membuat profile kosong via transaction.',
  })
  @ApiStandardResponse(UserResponseDto, {
    status: 201,
    description: 'Registrasi berhasil',
  })
  @ApiConflictResponse({ description: 'Email sudah terdaftar' })
  @ResponseMessage('Registrasi berhasil')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK) // default NestJS untuk POST adalah 201, login lebih tepat 200
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
    description: 'Refresh token tidak ada / invalid / kadaluarsa / sudah dipakai',
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
      await this.authService.logout(rawRefreshToken);
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
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(user.id);
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
}
