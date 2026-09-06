import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ApiStandardResponse } from '../../common/swagger/api-standard-response.decorator';
import { SWAGGER_BEARER_AUTH_NAME } from '../../config/swagger.config';

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
}
