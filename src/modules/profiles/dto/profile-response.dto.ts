import { ApiProperty } from '@nestjs/swagger';

export class ProfileResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 3, description: 'FK ke users.id' })
  userId!: number;

  @ApiProperty({ example: 'Budi Santoso', nullable: true })
  fullName!: string | null;

  @ApiProperty({
    example: '/uploads/avatars/user-3-abcd1234.webp',
    description: 'Selalu WebP 512×512. Default: /uploads/avatars/default.png',
  })
  avatarUrl!: string | null;

  @ApiProperty({ example: '081234567890', nullable: true })
  phone!: string | null;

  @ApiProperty({ example: 'Backend developer', nullable: true })
  bio!: string | null;

  @ApiProperty({ example: '2026-01-01T08:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T08:00:00.000Z' })
  updatedAt!: Date;
}
