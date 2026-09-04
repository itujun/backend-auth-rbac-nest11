import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthorizationRepository } from './authorization.repository';
import { AuthorizationService } from './authorization.service';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

/**
 * @Global() supaya AuthorizationService bisa dipakai PermissionsGuard
 * di modul manapun (role, permission, profile di Phase 4, dst) tanpa
 * masing-masing modul harus import RoleModule/PermissionModule segala.
 */
@Global()
@Module({
  providers: [
    AuthorizationRepository,
    AuthorizationService,
    // PermissionsGuard didaftarkan global juga — tapi dia NO-OP di
    // route yang tidak dipasangi @RequirePermission(), jadi aman untuk
    // semua route lain. Konsisten dengan pola JwtAuthGuard di AuthModule.
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}
