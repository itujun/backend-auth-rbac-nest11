import { Controller, Get, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('user:read')
  @ResponseMessage('Daftar user berhasil diambil')
  findAll(@Query() query: FindUsersQueryDto) {
    return this.usersService.findAll(query);
  }
}
