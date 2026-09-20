import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Sengaja DTO terpisah dari `RegisterDto` (bukan reuse langsung),
 * walau isinya identik sekarang -- dua alur ini punya audit trail dan
 * pemicu bisnis yang beda (`auth.register` vs `user.create`, lihat
 * AuditLogService), dan modul `users` seharusnya tidak bergantung ke
 * DTO milik modul `auth`. Kalau nanti admin butuh field tambahan
 * (mis. langsung assign role saat create), DTO ini yang berubah,
 * tanpa menyentuh alur self-registration sama sekali.
 */
export class CreateUserDto {
  @ApiProperty({ example: 'siti@example.com' })
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
  @MaxLength(72, { message: 'Password maksimal 72 karakter' })
  password: string;

  @ApiPropertyOptional({ maxLength: 255, example: 'Siti Aminah' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;
}
