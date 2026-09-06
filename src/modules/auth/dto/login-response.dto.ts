import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

/**
 * `refreshToken` SENGAJA tidak ada di sini — lihat komentar di
 * `AuthController.login()`. Kalau field ini muncul di dokumentasi,
 * artinya ada yang salah di implementasi (kebocoran token lewat body).
 */
export class LoginResponseDto {
  @ApiProperty({
    description: 'Kirim di header: Authorization: Bearer <accessToken>',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}
