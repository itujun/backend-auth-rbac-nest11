import { PaginatedResult } from '../interfaces/paginated-result.interface';

/**
 * Kenapa helper ini kecil sekali (bukan generic query builder besar)?
 *
 * Drizzle sengaja type-safe per-tabel: kolom, join, dan filter tiap
 * resource beda-beda. Memaksakan satu "generic list query builder"
 * yang tahu segalanya akan mengorbankan type-safety atau berujung jadi
 * abstraksi rumit untuk kasus yang jarang (sama seperti alasan
 * `BaseRepository` sengaja minimal — lihat core/repositories/base.repository.ts).
 *
 * DRY di sini dicapai dengan cara lain: tiap repository TETAP menulis
 * query where/orderBy/limit/offset miliknya sendiri secara eksplisit
 * (full type-safety), tapi bagian yang BENAR-BENAR selalu sama di
 * semua tempat — menjalankan query data & count secara bersamaan, lalu
 * membentuk objek `meta` — disatukan di sini.
 */
export async function paginate<T>(
  dataQuery: Promise<T[]>,
  countQuery: Promise<number>,
  params: { page: number; limit: number },
): Promise<PaginatedResult<T>> {
  const [items, totalItems] = await Promise.all([dataQuery, countQuery]);
  const totalPages =
    totalItems === 0 ? 0 : Math.ceil(totalItems / params.limit);

  return {
    items,
    meta: {
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages,
    },
  };
}

/** Konversi page (1-indexed) ke offset SQL (0-indexed). */
export function toOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}
