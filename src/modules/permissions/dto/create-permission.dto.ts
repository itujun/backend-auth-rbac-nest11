import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePermissionDto {
  // Konvensi wajib "resource:action", contoh "role:create", "profile:update"
  @ApiProperty({
    maxLength: 150,
    example: 'role:create',
    description: 'Format wajib "resource:action", huruf kecil.',
  })
  @IsString()
  @MaxLength(150)
  @Matches(/^[a-z][a-z0-9_]*:[a-z][a-z0-9_-]*$/, {
    message:
      'Nama permission harus mengikuti format "resource:action" huruf kecil, contoh: role:create',
  })
  name: string;

  @ApiPropertyOptional({ maxLength: 255, example: 'Membuat role baru' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
