import { ArrayUnique, IsArray, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Dipakai untuk endpoint PUT /roles/:id/permissions — menggantikan
 * SELURUH daftar permission role dengan yang dikirim (bukan
 * tambah/hapus satu-satu). Kirim array kosong `[]` untuk melepas
 * semua permission dari role ini.
 */
export class SyncRolePermissionsDto {
  @ApiProperty({
    type: [Number],
    example: [12, 13],
    description: 'ID permission yang MENGGANTIKAN seluruh daftar lama.',
  })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  permissionIds: number[];
}
