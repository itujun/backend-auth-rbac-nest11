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
import { UsersService } from './users.service';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ApiStandardResponse } from '../../common/swagger/api-standard-response.decorator';
import { SWAGGER_BEARER_AUTH_NAME } from '../../config/swagger.config';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SafeUser } from './types/safe-user.type';

@ApiTags('Users')
@ApiBearerAuth(SWAGGER_BEARER_AUTH_NAME)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('user:read')
  @ApiOperation({
    summary: 'Daftar user (pagination + search + filter + sort)',
    description:
      'Lihat query param yang didukung di bawah. Butuh permission `user:read`.',
  })
  @ApiStandardResponse(UserResponseDto, {
    paginated: true,
    description: 'Daftar user berhasil diambil',
  })
  @ApiForbiddenResponse({ description: 'Tidak memiliki permission user:read' })
  @ResponseMessage('Daftar user berhasil diambil')
  findAll(@Query() query: FindUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @Post()
  @RequirePermission('user:create')
  @ApiOperation({
    summary: 'Admin membuat user baru langsung (tanpa self-registration)',
  })
  @ApiStandardResponse(UserResponseDto, {
    status: 201,
    description: 'User berhasil dibuat',
  })
  @ApiConflictResponse({ description: 'Email sudah terdaftar' })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission user:create',
  })
  @ResponseMessage('User berhasil dibuat')
  create(@Body() dto: CreateUserDto, @CurrentUser() user: SafeUser) {
    return this.usersService.create(dto, {
      userId: user.id,
      email: user.email,
    });
  }

  @Patch(':id/suspend')
  @RequirePermission('user:manage-status')
  @ApiParam({ name: 'id', type: Number, example: 12 })
  @ApiOperation({ summary: 'Nonaktifkan user (reversibel)' })
  @ApiStandardResponse(UserResponseDto, {
    description: 'User berhasil dinonaktifkan',
  })
  @ApiNotFoundResponse({ description: 'User tidak ditemukan' })
  @ApiConflictResponse({ description: 'Tidak bisa menonaktifkan akun sendiri' })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission user:manage-status',
  })
  @ResponseMessage('User berhasil dinonaktifkan')
  suspend(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: SafeUser,
  ) {
    return this.usersService.suspend(id, {
      userId: user.id,
      email: user.email,
    });
  }

  @Patch(':id/reactivate')
  @RequirePermission('user:manage-status')
  @ApiParam({ name: 'id', type: Number, example: 12 })
  @ApiOperation({ summary: 'Aktifkan kembali user yang dinonaktifkan' })
  @ApiStandardResponse(UserResponseDto, {
    description: 'User berhasil diaktifkan kembali',
  })
  @ApiNotFoundResponse({
    description: 'User tidak ditemukan (termasuk yang sudah soft-deleted)',
  })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission user:manage-status',
  })
  @ResponseMessage('User berhasil diaktifkan kembali')
  reactivate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: SafeUser,
  ) {
    return this.usersService.reactivate(id, {
      userId: user.id,
      email: user.email,
    });
  }

  @Delete(':id')
  @RequirePermission('user:delete')
  @ApiParam({ name: 'id', type: Number, example: 12 })
  @ApiOperation({ summary: 'Hapus user (soft delete)' })
  @ApiResponse({ status: 200, description: 'User berhasil dihapus' })
  @ApiNotFoundResponse({ description: 'User tidak ditemukan' })
  @ApiConflictResponse({ description: 'Tidak bisa menghapus akun sendiri' })
  @ApiForbiddenResponse({
    description: 'Tidak memiliki permission user:delete',
  })
  @ResponseMessage('User berhasil dihapus')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: SafeUser,
  ) {
    await this.usersService.delete(id, { userId: user.id, email: user.email });
    return null;
  }
}
