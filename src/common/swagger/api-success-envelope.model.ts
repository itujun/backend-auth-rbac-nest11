import { ApiProperty } from '@nestjs/swagger';

/**
 * Representasi Swagger dari `ApiSuccessResponse<T>` di
 * `common/interfaces/api-response.interface.ts`.
 *
 * Kenapa perlu class terpisah, bukan langsung pakai interface itu?
 * TypeScript interface hilang total saat dikompilasi ke JS (tidak ada
 * jejak di runtime), sedangkan `@nestjs/swagger` butuh metadata runtime
 * (decorator `@ApiProperty`) untuk generate schema. Makanya dibuat class
 * "kembaran" khusus untuk kebutuhan dokumentasi — isinya harus selalu
 * disinkronkan manual kalau `ApiSuccessResponse` berubah.
 *
 * Kenapa tiap property pakai `!` (definite assignment assertion)?
 * Karena `strictNullChecks` aktif di tsconfig, TypeScript biasanya
 * mewajibkan property non-optional diisi lewat constructor/default value.
 * Tapi class ini KHUSUS untuk metadata Swagger — tidak pernah benar-benar
 * di-`new`, cuma dibaca `@nestjs/swagger` lewat reflection. `!` memberi
 * tahu compiler "percaya saja, ini memang sengaja begini", tanpa perlu
 * bikin constructor kosong yang tidak berguna.
 */
export class ApiSuccessEnvelope {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: 200 })
  statusCode!: number;

  @ApiProperty({ example: 'Success' })
  message!: string;

  @ApiProperty({
    required: false,
    description: 'Hanya muncul di endpoint list (pagination).',
    example: { page: 1, limit: 10, totalItems: 42, totalPages: 5 },
  })
  meta?: Record<string, unknown>;

  @ApiProperty({ example: '2026-09-06T04:30:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/api/users' })
  path!: string;
}
