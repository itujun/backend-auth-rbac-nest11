import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ProfilesService } from './profiles.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SafeUser } from '../users/types/safe-user.type';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

@Controller()
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  // ---- Self-service: user mengelola profile miliknya sendiri ----

  @Get('profile/me')
  @ResponseMessage('Profil berhasil diambil')
  getMyProfile(@CurrentUser() user: SafeUser) {
    return this.profilesService.getByUserIdOrThrow(user.id);
  }

  @Patch('profile/me')
  @ResponseMessage('Profil berhasil diperbarui')
  updateMyProfile(
    @CurrentUser() user: SafeUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profilesService.updateOwn(user.id, dto);
  }

  @Post('profile/me/avatar')
  @ResponseMessage('Avatar berhasil diperbarui')
  @UseInterceptors(
    FileInterceptor('avatar', {
      // Simpan di memory (buffer), BUKAN disk — kita proses lewat sharp
      // dulu (resize + convert WebP) baru ditulis final sekali ke disk.
      storage: memoryStorage(),
      limits: { fileSize: MAX_AVATAR_SIZE_BYTES },
    }),
  )
  uploadAvatar(
    @CurrentUser() user: SafeUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.profilesService.updateAvatar(user.id, file);
  }

  @Delete('profile/me/avatar')
  @ResponseMessage('Avatar berhasil direset ke default')
  resetMyAvatar(@CurrentUser() user: SafeUser) {
    return this.profilesService.resetAvatar(user.id);
  }

  // ---- Admin: melihat/mengubah profile user lain (contoh integrasi RBAC) ----

  @Get('profiles/:userId')
  @RequirePermission('profile:read')
  @ResponseMessage('Profil user berhasil diambil')
  getUserProfile(@Param('userId', ParseIntPipe) userId: number) {
    return this.profilesService.getByUserIdOrThrow(userId);
  }

  @Patch('profiles/:userId')
  @RequirePermission('profile:update')
  @ResponseMessage('Profil user berhasil diperbarui')
  updateUserProfile(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profilesService.updateByUserId(userId, dto);
  }
}
