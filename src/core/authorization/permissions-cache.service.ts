import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

/**
 * Lapisan cache-aside KHUSUS untuk daftar nama permission per user.
 *
 * Sengaja dipisah jadi service sendiri (bukan logic Redis ditulis
 * langsung di AuthorizationService) karena satu alasan penting: format
 * cache key & cara serialisasi HARUS konsisten di dua tempat yang
 * berbeda modul --
 *   1. AuthorizationService (READ) -- baca cache saat permission check
 *   2. RolesService / PermissionsService (WRITE/INVALIDATE, Phase 6c)
 *      -- hapus cache saat role_permissions atau user_roles berubah
 *
 * Kalau format key ditulis manual berulang di kedua tempat, satu typo
 * kecil (mis. "permission:user:" vs "permissions:user:") membuat
 * invalidation diam-diam GAGAL total tanpa error apapun -- bug yang
 * sangat sulit dilacak karena gejalanya cuma "kok permission lama masih
 * kepakai padahal sudah diubah". Dengan satu service ini sebagai
 * satu-satunya pintu masuk/keluar cache permission, method `key()` di
 * bawah adalah SATU-SATUNYA tempat format key didefinisikan.
 */
@Injectable()
export class PermissionsCacheService {
  private readonly logger = new Logger(PermissionsCacheService.name);
  private readonly ttlSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    this.ttlSeconds = this.configService.get<number>(
      'redis.permissionsTtlSeconds',
    ) as number;
  }

  /**
   * NOTE: tidak perlu prefix manual "rbac:" di sini -- REDIS_CLIENT
   * (lihat RedisModule) sudah dikonfigurasi dengan `keyPrefix: 'rbac:'`
   * di level koneksi ioredis, otomatis ditempelkan ke SEMUA command
   * yang lewat client ini.
   */
  private key(userId: number): string {
    return `permissions:user:${userId}`;
  }

  /**
   * Ambil daftar nama permission user dari cache.
   *
   * Return `null` untuk DUA kondisi yang beda maknanya secara bisnis
   * tapi SENGAJA diperlakukan sama oleh caller (AuthorizationService):
   *   a) benar-benar cache miss (key belum ada / sudah expired TTL)
   *   b) Redis error/down
   * Keduanya endingnya sama: caller harus fallback query ke DB. Ini
   * konsisten dengan filosofi resiliency yang sudah ditulis di
   * RedisModule (maxRetriesPerRequest: 1, enableOfflineQueue: false) --
   * Redis bermasalah TIDAK BOLEH membuat request gagal atau menggantung,
   * cukup dianggap seolah cache kosong.
   */
  async get(userId: number): Promise<string[] | null> {
    try {
      const raw = await this.redis.get(this.key(userId));
      if (raw === null) {
        return null;
      }
      return JSON.parse(raw) as string[];
    } catch (err) {
      this.logger.warn(
        `Gagal baca cache permission user #${userId}, fallback ke DB: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /**
   * Simpan daftar nama permission user ke cache dengan TTL sebagai
   * jaring pengaman (lihat REDIS_PERMISSIONS_TTL_SECONDS di
   * configuration.ts). Kegagalan tulis cache SENGAJA tidak dilempar ke
   * caller -- data yang barusan diambil dari DB tetap 100% benar dan
   * sudah dikembalikan ke pemanggil asli; gagal cache cuma berarti
   * request BERIKUTNYA akan cache-miss lagi dan query DB ulang, bukan
   * kegagalan fungsional.
   */
  async set(userId: number, permissionNames: string[]): Promise<void> {
    try {
      await this.redis.set(
        this.key(userId),
        JSON.stringify(permissionNames),
        'EX',
        this.ttlSeconds,
      );
    } catch (err) {
      this.logger.warn(
        `Gagal tulis cache permission user #${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Hapus cache permission SATU user. Dipanggil di titik mutasi yang
   * scope dampaknya per-user (assign/revoke role ke satu user).
   *
   * Beda dari `get()`/`set()`: kegagalan di sini di-log sebagai ERROR
   * (bukan warn) -- kalau invalidation gagal, user bisa terus memakai
   * permission LAMA (termasuk yang seharusnya sudah dicabut) sampai TTL
   * habis. Untuk RBAC, itu risiko keamanan, bukan sekadar data stale
   * biasa, jadi layak observability yang lebih tinggi.
   */
  async invalidateUser(userId: number): Promise<void> {
    try {
      await this.redis.del(this.key(userId));
    } catch (err) {
      this.logger.error(
        `Gagal invalidate cache permission user #${userId} -- user ini bisa` +
          ` terus pakai permission lama sampai TTL habis (${this.ttlSeconds}s): ${
            err instanceof Error ? err.message : String(err)
          }`,
      );
    }
  }

  /**
   * Hapus cache permission BANYAK user sekaligus, dalam satu round-trip
   * Redis (satu command `DEL key1 key2 ...`). Dipanggil di titik mutasi
   * yang dampaknya menyebar ke banyak user sekaligus: sync permission ke
   * role (semua user pemegang role itu), hapus role, atau hapus
   * permission (lihat RolesService/PermissionsService, Phase 6c).
   */
  async invalidateUsers(userIds: number[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    try {
      await this.redis.del(...userIds.map((id) => this.key(id)));
    } catch (err) {
      this.logger.error(
        `Gagal invalidate cache permission untuk ${userIds.length} user -- ` +
          `bisa terus pakai permission lama sampai TTL habis (${this.ttlSeconds}s): ${
            err instanceof Error ? err.message : String(err)
          }`,
      );
    }
  }
}
