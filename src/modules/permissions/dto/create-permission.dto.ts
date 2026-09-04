import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePermissionDto {
  // Konvensi wajib "resource:action", contoh "role:create", "profile:update"
  @IsString()
  @MaxLength(150)
  @Matches(/^[a-z][a-z0-9_]*:[a-z][a-z0-9_-]*$/, {
    message:
      'Nama permission harus mengikuti format "resource:action" huruf kecil, contoh: role:create',
  })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
