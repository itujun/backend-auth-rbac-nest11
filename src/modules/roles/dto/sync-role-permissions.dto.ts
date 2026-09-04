import { ArrayUnique, IsArray, IsInt } from 'class-validator';

/**
 * Dipakai untuk endpoint PUT /roles/:id/permissions — menggantikan
 * SELURUH daftar permission role dengan yang dikirim (bukan
 * tambah/hapus satu-satu). Kirim array kosong `[]` untuk melepas
 * semua permission dari role ini.
 */
export class SyncRolePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  permissionIds: number[];
}
