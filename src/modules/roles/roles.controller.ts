import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
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
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SyncRolePermissionsDto } from './dto/sync-role-permissions.dto';
import { FindRolesQueryDto } from './dto/find-roles-query.dto';
import { RoleResponseDto } from './dto/role-response.dto';
import { RolePermissionItemDto } from './dto/role-permission-item.dto';
import { RoleUserItemDto } from './dto/role-user-item.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ApiStandardResponse } from '../../common/swagger/api-standard-response.decorator';
import { SWAGGER_BEARER_AUTH_NAME } from '../../config/swagger.config';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SafeUser } from '../users/types/safe-user.type';

@ApiTags('Roles')
@ApiBearerAuth(SWAGGER_BEARER_AUTH_NAME)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermission('role:read')
  @ApiOperation({ summary: 'Daftar role (pagination + search + sort)' })
  @ApiStandardResponse(RoleResponseDto, {
    paginated: true,
    description: 'Daftar role berhasil diambil',
  })
  @ApiForbiddenResponse({ description: 'Tidak memiliki permission role:read' })
  @ResponseMessage('Daftar role berhasil diambil')
  findAll(@Query() query: FindRolesQueryDto) {
    return this.rolesService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('role:read')
  @ApiParam({ name: 'id', type: Number, example: 5 })
  @ApiOperation({ summary: 'Detail 1 role' })
  @ApiStandardResponse(RoleResponseDto, {
    description: 'Detail role berhasil diambil',
  })
  @ApiNotFoundResponse({ description: 'Role tidak ditemukan' })
  @ApiForbiddenResponse({ description: 'Tidak memiliki permission role:read' })
  @ResponseMessage('Detail role berhasil diambil')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findByIdOrThrow(id);
  }

  @Post()
  @RequirePermission('role:create')
  @ApiOperation({ summary: 'Buat role baru' })
  @ApiStandardResponse(RoleResponseDto, {
    status: 201,
    description: 'Role berhasil dibuat',
  })
  @ApiConflictResponse({ description: 'Nama role sudah dipakai' })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission role:create',
  })
  @ResponseMessage('Role berhasil dibuat')
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: SafeUser) {
    return this.rolesService.create(dto, {
      userId: user.id,
      email: user.email,
    });
  }

  @Patch(':id')
  @RequirePermission('role:update')
  @ApiParam({ name: 'id', type: Number, example: 5 })
  @ApiOperation({ summary: 'Ubah nama/deskripsi role' })
  @ApiStandardResponse(RoleResponseDto, {
    description: 'Role berhasil diperbarui',
  })
  @ApiNotFoundResponse({ description: 'Role tidak ditemukan' })
  @ApiConflictResponse({ description: 'Nama role sudah dipakai role lain' })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission role:update',
  })
  @ResponseMessage('Role berhasil diperbarui')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: SafeUser,
  ) {
    return this.rolesService.update(id, dto, {
      userId: user.id,
      email: user.email,
    });
  }

  @Delete(':id')
  @RequirePermission('role:delete')
  @ApiParam({ name: 'id', type: Number, example: 5 })
  @ApiOperation({ summary: 'Hapus role' })
  @ApiResponse({ status: 200, description: 'Role berhasil dihapus' })
  @ApiNotFoundResponse({ description: 'Role tidak ditemukan' })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission role:delete',
  })
  @ResponseMessage('Role berhasil dihapus')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: SafeUser,
  ) {
    await this.rolesService.delete(id, { userId: user.id, email: user.email });
    return null;
  }

  @Get(':id/permissions')
  @RequirePermission('role:read')
  @ApiParam({ name: 'id', type: Number, example: 5 })
  @ApiOperation({ summary: 'Daftar permission milik role ini' })
  @ApiStandardResponse(RolePermissionItemDto, {
    isArray: true,
    description: 'Daftar permission role berhasil diambil',
  })
  @ApiNotFoundResponse({ description: 'Role tidak ditemukan' })
  @ApiForbiddenResponse({ description: 'Tidak memiliki permission role:read' })
  @ResponseMessage('Daftar permission role berhasil diambil')
  listPermissions(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.listPermissions(id);
  }

  @Put(':id/permissions')
  @RequirePermission('role:manage-permissions')
  @ApiParam({ name: 'id', type: Number, example: 5 })
  @ApiOperation({
    summary: 'Ganti SELURUH daftar permission role ini',
    description: 'Bukan tambah/hapus satu-satu — lihat SyncRolePermissionsDto.',
  })
  @ApiStandardResponse(RolePermissionItemDto, {
    isArray: true,
    description: 'Permission role berhasil diperbarui',
  })
  @ApiNotFoundResponse({
    description: 'Role tidak ditemukan, atau ada permissionId yang tidak ada',
  })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission role:manage-permissions',
  })
  @ResponseMessage('Permission role berhasil diperbarui')
  syncPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SyncRolePermissionsDto,
    @CurrentUser() user: SafeUser,
  ) {
    return this.rolesService.syncPermissions(id, dto, {
      userId: user.id,
      email: user.email,
    });
  }

  @Get(':id/users')
  @RequirePermission('role:read')
  @ApiParam({ name: 'id', type: Number, example: 5 })
  @ApiOperation({ summary: 'Daftar user yang punya role ini' })
  @ApiStandardResponse(RoleUserItemDto, {
    isArray: true,
    description: 'Daftar user pemilik role berhasil diambil',
  })
  @ApiNotFoundResponse({ description: 'Role tidak ditemukan' })
  @ApiForbiddenResponse({ description: 'Tidak memiliki permission role:read' })
  @ResponseMessage('Daftar user pemilik role berhasil diambil')
  listUsers(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.listUsers(id);
  }

  @Post(':id/users/:userId')
  @RequirePermission('role:manage-users')
  @ApiParam({ name: 'id', type: Number, example: 5 })
  @ApiParam({ name: 'userId', type: Number, example: 7 })
  @ApiOperation({ summary: 'Assign role ke user' })
  @ApiResponse({ status: 201, description: 'Role berhasil di-assign ke user' })
  @ApiNotFoundResponse({ description: 'Role atau user tidak ditemukan' })
  @ApiConflictResponse({ description: 'User sudah memiliki role ini' })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission role:manage-users',
  })
  @ResponseMessage('Role berhasil di-assign ke user')
  async assignToUser(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: SafeUser,
  ) {
    await this.rolesService.assignToUser(id, userId, {
      userId: user.id,
      email: user.email,
    });
    return null;
  }

  @Delete(':id/users/:userId')
  @RequirePermission('role:manage-users')
  @ApiParam({ name: 'id', type: Number, example: 5 })
  @ApiParam({ name: 'userId', type: Number, example: 7 })
  @ApiOperation({ summary: 'Cabut role dari user' })
  @ApiResponse({
    status: 200,
    description: 'Role berhasil dicabut dari user',
  })
  @ApiNotFoundResponse({
    description: 'Role tidak ditemukan / user tidak memiliki role ini',
  })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission role:manage-users',
  })
  @ResponseMessage('Role berhasil dicabut dari user')
  async revokeFromUser(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: SafeUser,
  ) {
    await this.rolesService.revokeFromUser(id, userId, {
      userId: user.id,
      email: user.email,
    });
    return null;
  }
}
