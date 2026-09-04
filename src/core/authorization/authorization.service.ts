import { Injectable } from '@nestjs/common';
import { AuthorizationRepository } from './authorization.repository';

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly authorizationRepository: AuthorizationRepository,
  ) {}

  /**
   * Dipanggil PermissionsGuard di setiap request yang butuh permission
   * check. Sengaja query LANGSUNG ke DB tiap kali (bukan baca dari JWT
   * payload) supaya perubahan role/permission berlaku SEKETIKA — admin
   * cabut permission user, efeknya langsung kerasa di request
   * berikutnya, user tidak perlu logout/refresh dulu.
   *
   * Trade-off: ada 1 query tambahan per protected request. Untuk skala
   * project ini itu sepadan demi konsistensi data; kalau nanti trafik
   * besar, baru pertimbangkan caching (mis. Redis, invalidated saat
   * role/permission user berubah).
   */
  async getUserPermissionNames(userId: number): Promise<Set<string>> {
    const names =
      await this.authorizationRepository.findPermissionNamesByUserId(userId);
    return new Set(names);
  }
}
