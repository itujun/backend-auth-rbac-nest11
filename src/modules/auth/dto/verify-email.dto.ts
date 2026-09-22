import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Token mentah dari link di email (query param ?token=...)',
  })
  @IsString()
  @MinLength(1, { message: 'Token wajib diisi' })
  token: string;
}
