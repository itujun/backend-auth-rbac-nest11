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
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { User } from '../../database/schema';
import {
  RefreshTokensService,
  RequestMeta,
} from './refresh-tokens/refresh-tokens.service';
import { PasswordResetTokensService } from './password-reset-tokens/password-reset-tokens.service';
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

    // `record()` dijamin tidak pernah reject (lihat AuditLogService) —
    // aman di-`await` tanpa risiko registrasi yang SUDAH berhasil malah
    // dilaporkan gagal ke client gara-gara audit log gagal ditulis.
    await this.auditLogService.record({
      action: 'auth.register',
      actorUserId: user.id,
      actorEmail: user.email,
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    // Sama seperti audit log di atas: `notifyAdmin()` dijamin tidak
    // pernah reject (lihat TelegramService), jadi aman di-`await` di
    // sini tanpa risiko registrasi gagal gara-gara Telegram down.
    // SENGAJA diletakkan setelah audit log tercatat, bukan sebelum --
    // kalau ternyata harus dipilih urutan, audit trail (kepatuhan)
    // lebih prioritas daripada notifikasi (kenyamanan).
    await this.telegramService.notifyAdmin(
      [
        'Registrasi user baru',
        `Email: ${user.email}`,
        `User ID: ${user.id}`,
        `Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
      ].join('\n'),
    );

    return this.usersService.sanitize(user);
  }

  async login(dto: LoginDto, meta: RequestMeta = {}) {
    const user = await this.usersService.findByEmail(dto.email);

    // Pesan error SENGAJA dibuat sama antara "email tidak ada" dan
    // "password salah" (anti user-enumeration) — attacker tidak bisa
    // menebak email mana saja yang terdaftar dari response error.
    const invalidCredentialsError = new UnauthorizedException(
      'Email atau password salah',
    );

    if (!user) {
      // actorUserId null (user tidak ditemukan) TAPI actorEmail tetap
      // dicatat (email yang DICOBA, bukan email user asli) — berguna
      // untuk mendeteksi pola credential-stuffing/brute-force walau
      // emailnya sendiri tidak pernah terdaftar.
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
      // Edge case: user dihapus/dinonaktifkan tapi refresh token-nya
      // masih ada & valid (belum expired). Tolak dan bersihkan sesi.
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

    // revoked bisa null (token sudah basi/tidak dikenal) — logout tetap
    // idempotent, tapi tidak ada userId yang bisa dicatat sebagai actor.
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

  /**
   * SELALU resolve tanpa error, APAPUN hasilnya -- baik email tidak
   * terdaftar, akun tidak aktif, maupun email gagal terkirim. Ini
   * prinsip anti user-enumeration yang sama seperti `login()` (pesan
   * error email-salah vs password-salah dibuat identik) -- kalau
   * endpoint ini membalas beda antara "email ditemukan" vs "tidak",
   * attacker bisa memakainya untuk mengetes email mana saja yang
   * terdaftar di sistem, satu per satu.
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
    meta: RequestMeta = {},
  ): Promise<void> {
    const user = await this.usersService.findByEmail(dto.email);

    // Diam-diam berhenti di sini kalau user tidak ada / tidak aktif /
    // sudah dihapus -- TIDAK throw, TIDAK beda respons ke client
    // (lihat controller: selalu balas pesan generic yang sama).
    if (!user || !user.isActive || user.deletedAt) {
      return;
    }

    const { rawToken } = await this.passwordResetTokensService.issue(user.id);
    const frontendUrl = this.configService.get<string>('app.frontendUrl');
    const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;

    // TIDAK di-await tanpa try-catch seperti audit log/Telegram --
    // MailService SENGAJA tidak best-effort (lihat komentar di sana),
    // jadi AuthService yang menangkap kegagalannya di sini. Kalaupun
    // email gagal terkirim (mis. Maildev/SMTP provider lagi down),
    // client TETAP dapat respons generic sukses yang sama (anti
    // enumeration) -- kegagalan cuma terlihat di server log untuk ops,
    // bukan bocor ke response API.
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

    // Tiga kemungkinan (token tidak dikenal / sudah dipakai / sudah
    // kedaluwarsa) SENGAJA dibalas dengan pesan yang SAMA -- membedakan
    // pesannya akan membocorkan informasi ke attacker soal token mana
    // yang "pernah" valid.
    if (!consumed) {
      throw new BadRequestException('Token tidak valid atau sudah kedaluwarsa');
    }

    const user = await this.usersService.findById(consumed.userId);
    // Edge case: user dihapus PERSIS di antara token diterbitkan dan
    // dipakai. Token sudah kadung ditandai used oleh `consume()` di
    // atas (memang seharusnya, tetap sekali pakai), tapi tidak ada user
    // valid untuk diubah passwordnya.
    if (!user) {
      throw new BadRequestException('Token tidak valid atau sudah kedaluwarsa');
    }

    const passwordHash = await this.hashingService.hash(dto.newPassword);
    await this.usersService.updatePassword(user.id, passwordHash);

    // Password baru saja berubah -- paksa SEMUA sesi lama logout,
    // termasuk sesi attacker kalau skenarionya memang akun dibajak dan
    // pemilik asli sedang reset password untuk mengambil alih kembali.
    // Pola sama seperti kenapa `logoutAll()` ada sebagai endpoint
    // terpisah, cuma di sini dipicu otomatis, bukan diminta user.
    await this.refreshTokensService.revokeAllForUser(user.id);

    await this.auditLogService.record({
      action: 'password_reset.completed',
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
