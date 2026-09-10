import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class FindAuditLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter exact match, id user pelaku' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  actorUserId?: number;

  @ApiPropertyOptional({
    description: 'Filter exact match, contoh: auth.login_failed',
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Filter exact match, contoh: role' })
  @IsOptional()
  @IsString()
  resourceType?: string;

  // Cuma satu kolom yang bisa di-sort (createdAt) — audit log secara
  // alami dibaca kronologis, tidak seperti roles/permissions yang wajar
  // di-sort per nama.
  @ApiPropertyOptional({ enum: ['createdAt'], default: 'createdAt' })
  @IsOptional()
  @IsIn(['createdAt'])
  sortBy = 'createdAt' as const;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
