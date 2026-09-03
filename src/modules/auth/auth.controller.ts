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
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { SafeUser } from '../users/types/safe-user.type';
import { RefreshCookieHelper } from './utils/refresh-cookie.helper';

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
  @ResponseMessage('Registrasi berhasil')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK) // default NestJS untuk POST adalah 201, login lebih tepat 200
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
  @ResponseMessage('Profil user berhasil diambil')
  me(@CurrentUser() user: SafeUser) {
    return user;
  }
}
