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
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { FindPermissionsQueryDto } from './dto/find-permissions-query.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermission('permission:read')
  @ResponseMessage('Daftar permission berhasil diambil')
  findAll(@Query() query: FindPermissionsQueryDto) {
    return this.permissionsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('permission:read')
  @ResponseMessage('Detail permission berhasil diambil')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.permissionsService.findByIdOrThrow(id);
  }

  @Post()
  @RequirePermission('permission:create')
  @ResponseMessage('Permission berhasil dibuat')
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('permission:update')
  @ResponseMessage('Permission berhasil diperbarui')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.permissionsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('permission:delete')
  @ResponseMessage('Permission berhasil dihapus')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.permissionsService.delete(id);
    return null;
  }
}
