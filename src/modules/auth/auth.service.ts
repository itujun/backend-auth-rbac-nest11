import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { HashingService } from '../../core/hashing/hashing.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { User } from '../../database/schema';
import {
  RefreshTokensService,
  RequestMeta,
} from './refresh-tokens/refresh-tokens.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly hashingService: HashingService,
    private readonly jwtService: JwtService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly auditLogService: AuditLogService,
    private readonly telegramService: TelegramService,
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

  private generateAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return this.jwtService.signAsync(payload);
  }
}
