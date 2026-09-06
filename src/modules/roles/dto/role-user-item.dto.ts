import { ApiProperty } from '@nestjs/swagger';

/**
 * Bentuk user yang dikembalikan dalam konteks role (lihat
 * `UserRolesRepository.listUsersForRole()`) — cuma `id`/`email`/
 * `isActive`. Beda dari `UserResponseDto` (modul users) yang
 * merepresentasikan `SafeUser` penuh.
 */
export class RoleUserItemDto {
  @ApiProperty({ example: 7 })
  id!: number;

  @ApiProperty({ example: 'budi@example.com' })
  email!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;
}
