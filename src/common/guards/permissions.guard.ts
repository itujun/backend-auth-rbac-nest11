import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { AuthorizationService } from '../../core/authorization/authorization.service';
import type { SafeUser } from '../../modules/users/types/safe-user.type';

interface RequestWithUser {
  user?: SafeUser;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Route tanpa @RequirePermission() -> tidak ada pengecekan tambahan
    // (cukup lolos JwtAuthGuard global, artinya "asal login" sudah cukup).
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      // Seharusnya tidak pernah kejadian (JwtAuthGuard global sudah
      // menjamin request.user ada di titik ini), tapi dijaga eksplisit.
      throw new UnauthorizedException('User tidak terautentikasi');
    }

    const userPermissions =
      await this.authorizationService.getUserPermissionNames(user.id);

    const missingPermissions = requiredPermissions.filter(
      (permission) => !userPermissions.has(permission),
    );

    if (missingPermissions.length > 0) {
      throw new ForbiddenException(
        `Anda tidak memiliki izin: ${missingPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
