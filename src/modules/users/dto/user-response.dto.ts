import { ApiProperty } from '@nestjs/swagger';

/**
 * Representasi Swagger dari `SafeUser` (`Omit<User, 'passwordHash'>`,
 * lihat `types/safe-user.type.ts`). Sengaja dibuat sebagai class
 * terpisah di sini (bukan re-export type) karena alasan yang sama
 * seperti `ApiSuccessEnvelope`: Swagger butuh metadata runtime lewat
 * decorator, sedangkan `type`/`interface` TypeScript hilang saat
 * dikompilasi.
 *
 * Dipakai di banyak tempat: `/auth/register`, `/auth/login` (nested di
 * `LoginResponseDto`), `/auth/me`, dan nanti `GET /users` (Phase
 * anotasi Users/Profiles) — makanya ditaruh di modul `users` sebagai
 * satu sumber kebenaran, bukan diduplikasi per modul.
 */
export class UserResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'budi@example.com' })
  email!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-01-01T08:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T08:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Terisi kalau user sudah soft-deleted.',
  })
  deletedAt!: Date | null;
}
