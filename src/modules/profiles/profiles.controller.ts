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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { ProfilesService } from './profiles.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SafeUser } from '../users/types/safe-user.type';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ApiStandardResponse } from '../../common/swagger/api-standard-response.decorator';
import { SWAGGER_BEARER_AUTH_NAME } from '../../config/swagger.config';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

@ApiTags('Profiles')
@ApiBearerAuth(SWAGGER_BEARER_AUTH_NAME)
@Controller()
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  // ---- Self-service: user mengelola profile miliknya sendiri ----

  @Get('profile/me')
  @ApiOperation({ summary: 'Lihat profile milik sendiri' })
  @ApiStandardResponse(ProfileResponseDto, {
    description: 'Profil berhasil diambil',
  })
  @ResponseMessage('Profil berhasil diambil')
  getMyProfile(@CurrentUser() user: SafeUser) {
    return this.profilesService.getByUserIdOrThrow(user.id);
  }

  @Patch('profile/me')
  @ApiOperation({ summary: 'Update fullName/phone/bio milik sendiri' })
  @ApiStandardResponse(ProfileResponseDto, {
    description: 'Profil berhasil diperbarui',
  })
  @ResponseMessage('Profil berhasil diperbarui')
  updateMyProfile(
    @CurrentUser() user: SafeUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profilesService.updateOwn(user.id, dto);
  }

  @Post('profile/me/avatar')
  @ApiOperation({
    summary: 'Upload avatar',
    description:
      'Maks 5MB, format JPEG/PNG/WebP. Hasil akhir SELALU WebP 512×512 ' +
      '(divalidasi dari isi file sesungguhnya, bukan cuma Content-Type).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { avatar: { type: 'string', format: 'binary' } },
    },
  })
  @ApiStandardResponse(ProfileResponseDto, {
    description: 'Avatar berhasil diperbarui',
  })
  @ApiUnsupportedMediaTypeResponse({
    description: 'File bukan gambar valid / format tidak didukung',
  })
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
  @ApiOperation({ summary: 'Reset avatar ke default' })
  @ApiStandardResponse(ProfileResponseDto, {
    description: 'Avatar berhasil direset ke default',
  })
  @ResponseMessage('Avatar berhasil direset ke default')
  resetMyAvatar(@CurrentUser() user: SafeUser) {
    return this.profilesService.resetAvatar(user.id);
  }

  // ---- Admin: melihat/mengubah profile user lain (contoh integrasi RBAC) ----

  @Get('profiles/:userId')
  @RequirePermission('profile:read')
  @ApiParam({ name: 'userId', type: Number, example: 3 })
  @ApiOperation({ summary: 'Lihat profile user manapun (admin)' })
  @ApiStandardResponse(ProfileResponseDto, {
    description: 'Profil user berhasil diambil',
  })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission profile:read',
  })
  @ResponseMessage('Profil user berhasil diambil')
  getUserProfile(@Param('userId', ParseIntPipe) userId: number) {
    return this.profilesService.getByUserIdOrThrow(userId);
  }

  @Patch('profiles/:userId')
  @RequirePermission('profile:update')
  @ApiParam({ name: 'userId', type: Number, example: 3 })
  @ApiOperation({ summary: 'Ubah profile user manapun, tanpa avatar (admin)' })
  @ApiStandardResponse(ProfileResponseDto, {
    description: 'Profil user berhasil diperbarui',
  })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission profile:update',
  })
  @ResponseMessage('Profil user berhasil diperbarui')
  updateUserProfile(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profilesService.updateByUserId(userId, dto);
  }
}
