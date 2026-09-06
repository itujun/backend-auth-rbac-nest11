import { PartialType } from '@nestjs/swagger';
import { CreateRoleDto } from './create-role.dto';

/** PartialType dari `@nestjs/swagger` — lihat komentar di UpdatePermissionDto. */
export class UpdateRoleDto extends PartialType(CreateRoleDto) {}
