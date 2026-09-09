import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { RolesRepository } from './roles.repository';
import { RolePermissionsRepository } from './role-permissions.repository';
import { UserRolesRepository } from './user-roles.repository';
import { PermissionsModule } from '../permissions/permissions.module';
import { UsersModule } from '../users/users.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [PermissionsModule, UsersModule, AuditLogModule],
  controllers: [RolesController],
  providers: [
    RolesRepository,
    RolePermissionsRepository,
    UserRolesRepository,
    RolesService,
  ],
})
export class RolesModule {}
