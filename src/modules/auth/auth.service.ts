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

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly hashingService: HashingService,
    private readonly jwtService: JwtService,
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

  async login(dto: LoginDto) {
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

    return {
      accessToken,
      user: this.usersService.sanitize(user),
    };
  }

  private generateAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return this.jwtService.signAsync(payload);
  }
}
