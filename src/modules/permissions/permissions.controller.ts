import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { FindPermissionsQueryDto } from './dto/find-permissions-query.dto';
import { PermissionResponseDto } from './dto/permission-response.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ApiStandardResponse } from '../../common/swagger/api-standard-response.decorator';
import { SWAGGER_BEARER_AUTH_NAME } from '../../config/swagger.config';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SafeUser } from '../users/types/safe-user.type';

@ApiTags('Permissions')
@ApiBearerAuth(SWAGGER_BEARER_AUTH_NAME)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermission('permission:read')
  @ApiOperation({ summary: 'Daftar permission (pagination + search + sort)' })
  @ApiStandardResponse(PermissionResponseDto, {
    paginated: true,
    description: 'Daftar permission berhasil diambil',
  })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission permission:read',
  })
  @ResponseMessage('Daftar permission berhasil diambil')
  findAll(@Query() query: FindPermissionsQueryDto) {
    return this.permissionsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('permission:read')
  @ApiParam({ name: 'id', type: Number, example: 12 })
  @ApiOperation({ summary: 'Detail 1 permission' })
  @ApiStandardResponse(PermissionResponseDto, {
    description: 'Detail permission berhasil diambil',
  })
  @ApiNotFoundResponse({ description: 'Permission tidak ditemukan' })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission permission:read',
  })
  @ResponseMessage('Detail permission berhasil diambil')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.permissionsService.findByIdOrThrow(id);
  }

  @Post()
  @RequirePermission('permission:create')
  @ApiOperation({ summary: 'Buat permission baru' })
  @ApiStandardResponse(PermissionResponseDto, {
    status: 201,
    description: 'Permission berhasil dibuat',
  })
  @ApiConflictResponse({ description: 'Nama permission sudah dipakai' })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission permission:create',
  })
  @ResponseMessage('Permission berhasil dibuat')
  create(@Body() dto: CreatePermissionDto, @CurrentUser() user: SafeUser) {
    return this.permissionsService.create(dto, {
      userId: user.id,
      email: user.email,
    });
  }

  @Patch(':id')
  @RequirePermission('permission:update')
  @ApiParam({ name: 'id', type: Number, example: 12 })
  @ApiOperation({ summary: 'Ubah nama/deskripsi permission' })
  @ApiStandardResponse(PermissionResponseDto, {
    description: 'Permission berhasil diperbarui',
  })
  @ApiNotFoundResponse({ description: 'Permission tidak ditemukan' })
  @ApiConflictResponse({
    description: 'Nama permission sudah dipakai permission lain',
  })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission permission:update',
  })
  @ResponseMessage('Permission berhasil diperbarui')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePermissionDto,
    @CurrentUser() user: SafeUser,
  ) {
    return this.permissionsService.update(id, dto, {
      userId: user.id,
      email: user.email,
    });
  }

  @Delete(':id')
  @RequirePermission('permission:delete')
  @ApiParam({ name: 'id', type: Number, example: 12 })
  @ApiOperation({ summary: 'Hapus permission' })
  @ApiResponse({ status: 200, description: 'Permission berhasil dihapus' })
  @ApiNotFoundResponse({ description: 'Permission tidak ditemukan' })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission permission:delete',
  })
  @ResponseMessage('Permission berhasil dihapus')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: SafeUser,
  ) {
    await this.permissionsService.delete(id, {
      userId: user.id,
      email: user.email,
    });
    return null;
  }
}
