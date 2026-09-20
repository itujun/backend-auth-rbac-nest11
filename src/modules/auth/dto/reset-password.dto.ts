import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Token mentah dari link di email (query param ?token=...)',
  })
  @IsString()
  @MinLength(1, { message: 'Token wajib diisi' })
  token: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 72,
    example: 'passwordBaru123',
    description:
      'Minimal 8 karakter, maksimal 72 karakter (batas praktis argon2) -- sama seperti registrasi.',
  })
  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  @MaxLength(72, { message: 'Password maksimal 72 karakter' })
  newPassword: string;
}
