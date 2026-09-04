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
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SyncRolePermissionsDto } from './dto/sync-role-permissions.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermission('role:read')
  @ResponseMessage('Daftar role berhasil diambil')
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @RequirePermission('role:read')
  @ResponseMessage('Detail role berhasil diambil')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findByIdOrThrow(id);
  }

  @Post()
  @RequirePermission('role:create')
  @ResponseMessage('Role berhasil dibuat')
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('role:update')
  @ResponseMessage('Role berhasil diperbarui')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('role:delete')
  @ResponseMessage('Role berhasil dihapus')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.rolesService.delete(id);
    return null;
  }

  @Get(':id/permissions')
  @RequirePermission('role:read')
  @ResponseMessage('Daftar permission role berhasil diambil')
  listPermissions(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.listPermissions(id);
  }

  @Put(':id/permissions')
  @RequirePermission('role:manage-permissions')
  @ResponseMessage('Permission role berhasil diperbarui')
  syncPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SyncRolePermissionsDto,
  ) {
    return this.rolesService.syncPermissions(id, dto);
  }

  @Get(':id/users')
  @RequirePermission('role:read')
  @ResponseMessage('Daftar user pemilik role berhasil diambil')
  listUsers(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.listUsers(id);
  }

  @Post(':id/users/:userId')
  @RequirePermission('role:manage-users')
  @ResponseMessage('Role berhasil di-assign ke user')
  async assignToUser(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    await this.rolesService.assignToUser(id, userId);
    return null;
  }

  @Delete(':id/users/:userId')
  @RequirePermission('role:manage-users')
  @ResponseMessage('Role berhasil dicabut dari user')
  async revokeFromUser(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    await this.rolesService.revokeFromUser(id, userId);
    return null;
  }
}
