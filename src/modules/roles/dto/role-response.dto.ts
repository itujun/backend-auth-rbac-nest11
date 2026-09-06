import { ApiProperty } from '@nestjs/swagger';

export class RoleResponseDto {
  @ApiProperty({ example: 5 })
  id!: number;

  @ApiProperty({ example: 'editor' })
  name!: string;

  @ApiProperty({ example: 'Bisa lihat role & permission', nullable: true })
  description!: string | null;

  @ApiProperty({ example: '2026-01-01T08:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T08:00:00.000Z' })
  updatedAt!: Date;
}
