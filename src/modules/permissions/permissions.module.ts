import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { PermissionsRepository } from './permissions.repository';

@Module({
  controllers: [PermissionsController],
  providers: [PermissionsRepository, PermissionsService],
  // Diexport karena RoleModule butuh validasi "apakah permission ID ini ada?"
  // saat sync permission ke role.
  exports: [PermissionsService],
})
export class PermissionsModule {}
