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

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly hashingService: HashingService,
    private readonly jwtService: JwtService,
    private readonly refreshTokensService: RefreshTokensService,
  ) {}

  async register(dto: RegisterDto) {
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
      throw invalidCredentialsError;
    }

    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Akun tidak aktif');
    }

    const isPasswordValid = await this.hashingService.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw invalidCredentialsError;
    }

    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.refreshTokensService.issue(user.id, meta);

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

  logout(rawRefreshToken: string): Promise<void> {
    return this.refreshTokensService.revoke(rawRefreshToken);
  }

  logoutAll(userId: number): Promise<void> {
    return this.refreshTokensService.revokeAllForUser(userId);
  }

  private generateAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return this.jwtService.signAsync(payload);
  }
}
