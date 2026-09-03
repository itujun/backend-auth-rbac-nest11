import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Format email tidak valid' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  @MaxLength(72, { message: 'Password maksimal 72 karakter' }) // batas praktis argon2/bcrypt
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;
}
