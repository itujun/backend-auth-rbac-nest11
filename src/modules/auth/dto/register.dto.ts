import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'budi@example.com' })
  @IsEmail({}, { message: 'Format email tidak valid' })
  email: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 72,
    example: 'password123',
    description:
      'Minimal 8 karakter, maksimal 72 karakter (batas praktis argon2).',
  })
  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  // batas praktis argon2/bcrypt
  @MaxLength(72, { message: 'Password maksimal 72 karakter' })
  password: string;

  @ApiPropertyOptional({ maxLength: 255, example: 'Budi Santoso' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;
}
