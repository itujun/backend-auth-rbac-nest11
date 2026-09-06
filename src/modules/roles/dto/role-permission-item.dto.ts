import { ApiProperty } from '@nestjs/swagger';

/**
 * Bentuk permission yang dikembalikan dalam konteks role (lihat
 * `RolePermissionsRepository.listPermissionsForRole()`) — cuma
 * `id`/`name`/`description`, TANPA `createdAt`/`updatedAt`. Sengaja
 * dibuat DTO terpisah dari `PermissionResponseDto` (modul permissions)
 * karena bentuk datanya memang beda, bukan cuma "PermissionResponseDto
 * tapi sebagian field-nya disembunyikan".
 */
export class RolePermissionItemDto {
  @ApiProperty({ example: 12 })
  id!: number;

  @ApiProperty({ example: 'role:create' })
  name!: string;

  @ApiProperty({ example: 'Membuat role baru', nullable: true })
  description!: string | null;
}
