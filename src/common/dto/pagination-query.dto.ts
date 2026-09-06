import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Base DTO untuk semua endpoint list. Resource-specific query DTO
 * (roles, permissions, users, dst) tinggal `extends` ini dan menambah
 * field `search`/`sortBy`/filter miliknya sendiri — bukan menulis ulang
 * validasi page/limit di tiap tempat (DRY).
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number) // query string selalu string mentah, perlu di-convert manual ke number
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100) // batas atas — cegah client minta limit=999999 yang membebani DB
  limit: number = 10;
}
