import { Injectable } from '@nestjs/common';
import { AuthorizationRepository } from './authorization.repository';
import { PermissionsCacheService } from './permissions-cache.service';

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly authorizationRepository: AuthorizationRepository,
    private readonly permissionsCache: PermissionsCacheService,
  ) {}

  /**
   * Dipanggil PermissionsGuard di setiap request yang butuh permission
   * check. Cache-aside pattern:
   *   1. Cek Redis dulu -- kalau HIT, langsung return, TIDAK sentuh DB
   *      sama sekali.
   *   2. Kalau MISS (belum ada / expired / Redis down), query DB seperti
   *      sebelumnya, lalu simpan hasilnya ke cache untuk request
   *      berikutnya.
   *
   * Perubahan role/permission TETAP berlaku seketika (bukan cuma nunggu
   * TTL habis) -- itu tanggung jawab invalidation eksplisit yang
   * dipanggil di RolesService/PermissionsService setiap kali
   * role_permissions atau user_roles berubah (lihat PermissionsCacheService,
   * dipasang di Phase 6c). TTL di sini murni jaring pengaman kalau ada
   * jalur invalidation yang terlewat, BUKAN mekanisme utama.
   */
  async getUserPermissionNames(userId: number): Promise<Set<string>> {
    const cached = await this.permissionsCache.get(userId);
    if (cached !== null) {
      return new Set(cached);
    }

    const names =
      await this.authorizationRepository.findPermissionNamesByUserId(userId);

    // Tidak di-await secara terpisah/fire-and-forget -- tetap di-await
    // supaya urutan eksekusi predictable saat testing, tapi error di
    // dalamnya SUDAH ditangani penuh di dalam PermissionsCacheService.set()
    // (tidak pernah reject), jadi tidak memperlambat/menggagalkan
    // response ke caller kalau tulis cache gagal.
    await this.permissionsCache.set(userId, names);

    return new Set(names);
  }
}
