import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { SafeUser } from '../../users/types/safe-user.type';

interface RequestWithUser {
  user?: SafeUser;
}

/**
 * Contoh pemakaian: me(@CurrentUser() user: SafeUser) { return user; }
 * `request.user` diisi otomatis oleh JwtStrategy.validate() di atas.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SafeUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();

    if (!request.user) {
      // Seharusnya tidak pernah kejadian kalau guard sudah jalan benar,
      // tapi tetap dijaga supaya tidak silent-return undefined.
      throw new UnauthorizedException('User tidak terautentikasi');
    }

    return request.user;
  },
);
