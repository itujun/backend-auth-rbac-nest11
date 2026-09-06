import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const SORTABLE_FIELDS = ['name', 'createdAt'] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

export class FindRolesQueryDto extends PaginationQueryDto {
  /** Pencarian bebas — cocok ke `name` ATAU `description` (case-insensitive). */
  @ApiPropertyOptional({ description: 'Cocok ke name ATAU description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: SORTABLE_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(SORTABLE_FIELDS)
  sortBy: SortableField = 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
