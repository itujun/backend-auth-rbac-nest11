import {
  ConflictException,
  Injectable,
  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { HashingService } from '../../core/hashing/hashing.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { User } from '../../database/schema';
import {
  RefreshTokensService,
  RequestMeta,
} from './refresh-tokens/refresh-tokens.service';
import { PasswordResetTokensService } from './password-reset-tokens/password-reset-tokens.service';
import { EmailVerificationTokensService } from './email-verification-tokens/email-verification-tokens.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TelegramService } from '../telegram/telegram.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly hashingService: HashingService,
    private readonly jwtService: JwtService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly passwordResetTokensService: PasswordResetTokensService,
    private readonly emailVerificationTokensService: EmailVerificationTokensService,
    private readonly auditLogService: AuditLogService,
    private readonly telegramService: TelegramService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto, meta: RequestMeta = {}) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const passwordHash = await this.hashingService.hash(dto.password);

    const user = await this.usersService.createWithProfile({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
    });

    await this.auditLogService.record({
      action: 'auth.register',
      actorUserId: user.id,
      actorEmail: user.email,
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    await this.telegramService.notifyAdmin(
      [
        'Registrasi user baru',
        `Email: ${user.email}`,
        `User ID: ${user.id}`,
        `Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
      ].join('\n'),
    );

    // Best-effort, SAMA alasannya seperti forgotPassword() -- kegagalan
    // kirim (mis. SMTP down) tidak boleh menggagalkan registrasi yang
    // SUDAH berhasil. Opsi B (lihat diskusi desain fitur ini): user
    // tetap bisa login walau belum verifikasi, jadi tidak fatal kalau
    // email ini sempat tidak sampai -- user bisa minta kirim ulang
    // lewat resendVerification() kapan saja.
    try {
      const { rawToken } = await this.emailVerificationTokensService.issue(
        user.id,
      );
      const frontendUrl = this.configService.get<string>('app.frontendUrl');
      const verifyLink = `${frontendUrl}/verify-email?token=${rawToken}`;
      await this.mailService.sendMail({
        to: user.email,
        subject: 'Verifikasi Email — Access Console',
        html: [
          `<p>Terima kasih sudah mendaftar di Access Console.</p>`,
          `<p><a href="${verifyLink}">Klik di sini untuk verifikasi email kamu</a></p>`,
          `<p>Link ini berlaku 24 jam.</p>`,
        ].join('\n'),
      });
    } catch (err) {
      this.logger.error(
        `Gagal mengirim email verifikasi ke ${user.email}: ${String(err)}`,
      );
    }

    return this.usersService.sanitize(user);
  }

  async login(dto: LoginDto, meta: RequestMeta = {}) {
    const user = await this.usersService.findByEmail(dto.email);

    const invalidCredentialsError = new UnauthorizedException(
      'Email atau password salah',
    );

    if (!user) {
      await this.auditLogService.record({
        action: 'auth.login_failed',
        actorEmail: dto.email,
        metadata: { reason: 'user_not_found' },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw invalidCredentialsError;
    }

    if (!user.isActive || user.deletedAt) {
      await this.auditLogService.record({
        action: 'auth.login_failed',
        actorUserId: user.id,
        actorEmail: user.email,
        metadata: { reason: 'account_inactive' },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Akun tidak aktif');
    }

    const isPasswordValid = await this.hashingService.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      await this.auditLogService.record({
        action: 'auth.login_failed',
        actorUserId: user.id,
        actorEmail: user.email,
        metadata: { reason: 'invalid_password' },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw invalidCredentialsError;
    }

    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.refreshTokensService.issue(user.id, meta);

    await this.auditLogService.record({
      action: 'auth.login_success',
      actorUserId: user.id,
      actorEmail: user.email,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      accessToken,
      refreshToken: refreshToken.rawToken,
      refreshTokenExpiresAt: refreshToken.expiresAt,
      user: this.usersService.sanitize(user),
    };
  }

  /** Tukar refresh token (dari cookie) dengan access token + refresh token baru. */
  async refresh(rawRefreshToken: string, meta: RequestMeta = {}) {
    const { userId, refreshToken } = await this.refreshTokensService.rotate(
      rawRefreshToken,
      meta,
    );

    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      await this.refreshTokensService.revokeAllForUser(userId);
      throw new UnauthorizedException('User tidak ditemukan atau tidak aktif');
    }

    const accessToken = await this.generateAccessToken(user);

    return {
      accessToken,
      refreshToken: refreshToken.rawToken,
      refreshTokenExpiresAt: refreshToken.expiresAt,
    };
  }

  async logout(rawRefreshToken: string, meta: RequestMeta = {}): Promise<void> {
    const revoked = await this.refreshTokensService.revoke(rawRefreshToken);

    if (revoked) {
      await this.auditLogService.record({
        action: 'auth.logout',
        actorUserId: revoked.userId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    }
  }

  async logoutAll(userId: number, meta: RequestMeta = {}): Promise<void> {
    await this.refreshTokensService.revokeAllForUser(userId);
    await this.auditLogService.record({
      action: 'auth.logout_all',
      actorUserId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
    meta: RequestMeta = {},
  ): Promise<void> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || !user.isActive || user.deletedAt) {
      return;
    }

    const { rawToken } = await this.passwordResetTokensService.issue(user.id);
    const frontendUrl = this.configService.get<string>('app.frontendUrl');
    const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;

    try {
      await this.mailService.sendMail({
        to: user.email,
        subject: 'Reset Password — Access Console',
        html: [
          `<p>Ada permintaan reset password untuk akun ${user.email}.</p>`,
          `<p><a href="${resetLink}">Klik di sini untuk atur password baru</a></p>`,
          `<p>Link ini berlaku 30 menit. Kalau kamu tidak merasa meminta ini, abaikan saja email ini.</p>`,
        ].join('\n'),
      });
    } catch (err) {
      this.logger.error(
        `Gagal mengirim email reset password ke ${user.email}: ${String(err)}`,
      );
    }

    await this.auditLogService.record({
      action: 'password_reset.requested',
      actorUserId: user.id,
      actorEmail: user.email,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async resetPassword(
    dto: ResetPasswordDto,
    meta: RequestMeta = {},
  ): Promise<void> {
    const consumed = await this.passwordResetTokensService.consume(dto.token);

    if (!consumed) {
      throw new BadRequestException('Token tidak valid atau sudah kedaluwarsa');
    }

    const user = await this.usersService.findById(consumed.userId);
    if (!user) {
      throw new BadRequestException('Token tidak valid atau sudah kedaluwarsa');
    }

    const passwordHash = await this.hashingService.hash(dto.newPassword);
    await this.usersService.updatePassword(user.id, passwordHash);

    await this.refreshTokensService.revokeAllForUser(user.id);

    await this.auditLogService.record({
      action: 'password_reset.completed',
      actorUserId: user.id,
      actorEmail: user.email,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async verifyEmail(
    dto: VerifyEmailDto,
    meta: RequestMeta = {},
  ): Promise<void> {
    const consumed = await this.emailVerificationTokensService.consume(
      dto.token,
    );
    if (!consumed) {
      throw new BadRequestException('Token tidak valid atau sudah kedaluwarsa');
    }

    const user = await this.usersService.findById(consumed.userId);
    if (!user) {
      throw new BadRequestException('Token tidak valid atau sudah kedaluwarsa');
    }

    // Guard idempotent: token sekali pakai sudah cukup untuk mencegah
    // token yang SAMA dipakai dua kali, tapi ini jaga-jaga tambahan
    // untuk skenario token BEDA yang kebetulan dipakai setelah user
    // sudah terverifikasi lebih dulu (mis. link lama di email lain
    // yang belum sempat diinvalidasi) -- supaya tidak menulis
    // `emailVerifiedAt` ulang atau audit log dobel untuk kejadian yang
    // secara efektif sama.
    if (!user.emailVerifiedAt) {
      await this.usersService.markEmailVerified(user.id);
      await this.auditLogService.record({
        action: 'email_verification.completed',
        actorUserId: user.id,
        actorEmail: user.email,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    }
  }

  /**
   * Anti-enumeration, SAMA persis pola & alasannya dengan
   * forgotPassword() -- diam-diam berhenti (TANPA beda respons ke
   * client) kalau email tidak terdaftar, akun tidak aktif/dihapus,
   * ATAU sudah terverifikasi (kondisi terakhir ini yang beda dari
   * forgotPassword, tapi alasannya sama: tidak membocorkan status
   * verifikasi akun orang lain lewat endpoint publik ini).
   */
  async resendVerification(
    dto: ResendVerificationDto,
    meta: RequestMeta = {},
  ): Promise<void> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || !user.isActive || user.deletedAt || user.emailVerifiedAt) {
      return;
    }

    const { rawToken } = await this.emailVerificationTokensService.issue(
      user.id,
    );
    const frontendUrl = this.configService.get<string>('app.frontendUrl');
    const verifyLink = `${frontendUrl}/verify-email?token=${rawToken}`;

    try {
      await this.mailService.sendMail({
        to: user.email,
        subject: 'Verifikasi Email — Access Console',
        html: [
          `<p>Berikut link verifikasi email baru untuk akun ${user.email}.</p>`,
          `<p><a href="${verifyLink}">Klik di sini untuk verifikasi email kamu</a></p>`,
          `<p>Link ini berlaku 24 jam.</p>`,
        ].join('\n'),
      });
    } catch (err) {
      this.logger.error(
        `Gagal mengirim ulang email verifikasi ke ${user.email}: ${String(err)}`,
      );
    }

    await this.auditLogService.record({
      action: 'email_verification.resent',
      actorUserId: user.id,
      actorEmail: user.email,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  private generateAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return this.jwtService.signAsync(payload);
  }
}
