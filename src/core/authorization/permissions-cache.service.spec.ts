import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { PermissionsCacheService } from './permissions-cache.service';

const TTL_SECONDS = 300;

function createService() {
  const redis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };
  const configService = {
    get: jest.fn().mockReturnValue(TTL_SECONDS),
  };

  const service = new PermissionsCacheService(
    redis as unknown as Redis,
    configService as unknown as ConfigService,
  );

  return { service, redis };
}

describe('PermissionsCacheService', () => {
  describe('get', () => {
    it('mengembalikan array hasil parse kalau cache HIT', async () => {
      const { service, redis } = createService();
      redis.get.mockResolvedValue(
        JSON.stringify(['role:create', 'role:update']),
      );

      const result = await service.get(7);

      expect(redis.get).toHaveBeenCalledWith('permissions:user:7');
      expect(result).toEqual(['role:create', 'role:update']);
    });

    it('mengembalikan array KOSONG (bukan null) kalau user memang tidak punya permission tapi sudah pernah di-cache', async () => {
      const { service, redis } = createService();
      redis.get.mockResolvedValue('[]');

      const result = await service.get(7);

      // Beda penting: '[]' adalah cache HIT yang valid, harus dibedakan
      // dari `null` (cache MISS) supaya user tanpa permission sama
      // sekali tidak selalu jatuh ke DB tiap request.
      expect(result).toEqual([]);
    });

    it('mengembalikan null kalau cache MISS (key belum ada)', async () => {
      const { service, redis } = createService();
      redis.get.mockResolvedValue(null);

      const result = await service.get(7);

      expect(result).toBeNull();
    });

    it('mengembalikan null (fail-safe) kalau Redis error, TIDAK melempar exception', async () => {
      const { service, redis } = createService();
      redis.get.mockRejectedValue(new Error('Connection refused'));

      await expect(service.get(7)).resolves.toBeNull();
    });
  });

  describe('set', () => {
    it('menulis ke Redis dengan key, JSON string, dan TTL yang benar', async () => {
      const { service, redis } = createService();
      redis.set.mockResolvedValue('OK');

      await service.set(7, ['role:create']);

      expect(redis.set).toHaveBeenCalledWith(
        'permissions:user:7',
        JSON.stringify(['role:create']),
        'EX',
        TTL_SECONDS,
      );
    });

    it('TIDAK melempar exception kalau Redis error saat menulis', async () => {
      const { service, redis } = createService();
      redis.set.mockRejectedValue(new Error('Connection refused'));

      await expect(service.set(7, ['role:create'])).resolves.toBeUndefined();
    });
  });

  describe('invalidateUser', () => {
    it('menghapus key cache milik user tersebut', async () => {
      const { service, redis } = createService();
      redis.del.mockResolvedValue(1);

      await service.invalidateUser(7);

      expect(redis.del).toHaveBeenCalledWith('permissions:user:7');
    });

    it('TIDAK melempar exception kalau Redis error saat invalidate', async () => {
      const { service, redis } = createService();
      redis.del.mockRejectedValue(new Error('Connection refused'));

      await expect(service.invalidateUser(7)).resolves.toBeUndefined();
    });
  });

  describe('invalidateUsers', () => {
    it('menghapus SEMUA key cache dalam satu panggilan DEL', async () => {
      const { service, redis } = createService();
      redis.del.mockResolvedValue(3);

      await service.invalidateUsers([1, 2, 3]);

      expect(redis.del).toHaveBeenCalledWith(
        'permissions:user:1',
        'permissions:user:2',
        'permissions:user:3',
      );
      expect(redis.del).toHaveBeenCalledTimes(1);
    });

    it('tidak memanggil Redis sama sekali kalau daftar user kosong', async () => {
      const { service, redis } = createService();

      await service.invalidateUsers([]);

      expect(redis.del).not.toHaveBeenCalled();
    });

    it('TIDAK melempar exception kalau Redis error saat invalidate massal', async () => {
      const { service, redis } = createService();
      redis.del.mockRejectedValue(new Error('Connection refused'));

      await expect(service.invalidateUsers([1, 2])).resolves.toBeUndefined();
    });
  });
});
