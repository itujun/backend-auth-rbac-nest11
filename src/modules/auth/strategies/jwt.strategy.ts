import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret') as string,
    });
  }

  /**
   * Dipanggil otomatis oleh Passport SETELAH signature & expiry token
   * terverifikasi valid. Kita masih query ulang ke DB (bukan cuma
   * percaya isi payload) supaya:
   * - User yang baru saja di-nonaktifkan/dihapus langsung ke-reject,
   *   walau access token-nya belum expired.
   * - Return value di sini otomatis jadi `request.user`.
   */
  async validate(payload: JwtPayload) {
    const user = await this.usersService.findActiveById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User tidak ditemukan atau tidak aktif');
    }

    return this.usersService.sanitize(user);
  }
}
