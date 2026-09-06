import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const SORTABLE_FIELDS = ['email', 'createdAt'] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

export class FindUsersQueryDto extends PaginationQueryDto {
  /** Pencarian bebas — cocok ke `email` (case-insensitive). */
  @IsOptional()
  @IsString()
  search?: string;

  /** Filter exact match. Query string "true"/"false" perlu dikonversi manual — boolean asli tidak ada di query string. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(SORTABLE_FIELDS)
  sortBy: SortableField = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
