import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { ProfilesRepository } from './profiles.repository';
import { AvatarStorageService } from './storage/avatar-storage.service';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [AuditLogModule],
  controllers: [ProfilesController],
  providers: [ProfilesRepository, ProfilesService, AvatarStorageService],
})
export class ProfilesModule {}
