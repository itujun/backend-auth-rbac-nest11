import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthorizationRepository } from './authorization.repository';
import { AuthorizationService } from './authorization.service';
import { PermissionsCacheService } from './permissions-cache.service';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

/**
 * @Global() supaya AuthorizationService bisa dipakai PermissionsGuard
 * di modul manapun (role, permission, profile di Phase 4, dst) tanpa
 * masing-masing modul harus import RoleModule/PermissionModule segala.
 *
 * PermissionsCacheService juga di-export -- RolesService &
 * PermissionsService (Phase 6c) memanggilnya langsung untuk
 * invalidation saat role_permissions/user_roles berubah.
 *
 * AuthorizationRepository juga di-export -- PermissionsService butuh
 * `findUserIdsAffectedByPermission()` untuk fan-out invalidation saat
 * sebuah permission dihapus/di-rename, TANPA perlu PermissionsModule
 * import RolesModule (yang akan bikin circular dependency, karena
 * RolesModule sendiri sudah import PermissionsModule).
 */
@Global()
@Module({
  providers: [
    AuthorizationRepository,
    AuthorizationService,
    PermissionsCacheService,
    // PermissionsGuard didaftarkan global juga — tapi dia NO-OP di
    // route yang tidak dipasangi @RequirePermission(), jadi aman untuk
    // semua route lain. Konsisten dengan pola JwtAuthGuard di AuthModule.
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [
    AuthorizationService,
    PermissionsCacheService,
    AuthorizationRepository,
  ],
})
export class AuthorizationModule {}
