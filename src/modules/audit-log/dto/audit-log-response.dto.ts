import { ApiProperty } from '@nestjs/swagger';

export class AuditLogResponseDto {
  @ApiProperty({ example: 101 })
  id!: number;

  @ApiProperty({ example: 7, nullable: true })
  actorUserId!: number | null;

  @ApiProperty({ example: 'budi@example.com', nullable: true })
  actorEmail!: string | null;

  @ApiProperty({ example: 'role.assign_user' })
  action!: string;

  @ApiProperty({ example: 'user_role', nullable: true })
  resourceType!: string | null;

  @ApiProperty({ example: '5:7', nullable: true })
  resourceId!: string | null;

  @ApiProperty({
    example: { roleId: 5, userId: 7 },
    nullable: true,
    description: 'Detail bebas, beda-beda tergantung `action`.',
  })
  metadata!: unknown;

  @ApiProperty({ example: '127.0.0.1', nullable: true })
  ipAddress!: string | null;

  @ApiProperty({ example: 'Mozilla/5.0...', nullable: true })
  userAgent!: string | null;

  @ApiProperty({ example: '2026-01-01T08:00:00.000Z' })
  createdAt!: Date;
}
