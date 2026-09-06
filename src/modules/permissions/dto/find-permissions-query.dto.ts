import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const SORTABLE_FIELDS = ['name', 'createdAt'] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

export class FindPermissionsQueryDto extends PaginationQueryDto {
  /** Pencarian bebas — cocok ke `name` ATAU `description` (case-insensitive). */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(SORTABLE_FIELDS)
  sortBy: SortableField = 'name';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
