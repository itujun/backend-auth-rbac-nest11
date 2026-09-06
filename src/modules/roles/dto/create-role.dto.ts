import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ minLength: 2, maxLength: 100, example: 'editor' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    maxLength: 255,
    example: 'Bisa lihat role & permission',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
