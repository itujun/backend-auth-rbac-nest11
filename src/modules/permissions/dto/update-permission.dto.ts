import { PartialType } from '@nestjs/mapped-types';
import { CreatePermissionDto } from './create-permission.dto';

/**
 * PartialType bikin semua field CreatePermissionDto jadi optional,
 * TANPA menulis ulang aturan validasi (@IsString, @Matches, dst).
 * Ini contoh konkret DRY di layer DTO.
 */
export class UpdatePermissionDto extends PartialType(CreatePermissionDto) {}
