import { PartialType } from '@nestjs/swagger';
import { CreatePermissionDto } from './create-permission.dto';

/**
 * PartialType (dari `@nestjs/swagger`, bukan `@nestjs/mapped-types`)
 * bikin semua field CreatePermissionDto jadi optional — baik untuk
 * validasi (class-validator) MAUPUN dokumentasi (OpenAPI `required`) —
 * tanpa menulis ulang aturan validasi (@IsString, @Matches, dst).
 * Ini contoh konkret DRY di layer DTO.
 */
export class UpdatePermissionDto extends PartialType(CreatePermissionDto) {}
