import { ApiProperty } from '@nestjs/swagger';

export class PermissionResponseDto {
  @ApiProperty({ example: 12 })
  id!: number;

  @ApiProperty({
    example: 'role:create',
    description: 'Konvensi wajib "resource:action", huruf kecil.',
  })
  name!: string;

  @ApiProperty({ example: 'Membuat role baru', nullable: true })
  description!: string | null;

  @ApiProperty({ example: '2026-01-01T08:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T08:00:00.000Z' })
  updatedAt!: Date;
}
