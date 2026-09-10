import { AuthorizationService } from './authorization.service';
import { AuthorizationRepository } from './authorization.repository';
import { PermissionsCacheService } from './permissions-cache.service';

function createService() {
  const authorizationRepository = {
    findPermissionNamesByUserId: jest.fn(),
  };
  const permissionsCache = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
  };

  const service = new AuthorizationService(
    authorizationRepository as unknown as AuthorizationRepository,
    permissionsCache as unknown as PermissionsCacheService,
  );

  return { service, authorizationRepository, permissionsCache };
}

describe('AuthorizationService', () => {
  describe('getUserPermissionNames', () => {
    it('CACHE HIT: mengembalikan langsung dari cache, TIDAK query DB sama sekali', async () => {
      const { service, authorizationRepository, permissionsCache } =
        createService();
      permissionsCache.get.mockResolvedValue(['role:create', 'role:update']);

      const result = await service.getUserPermissionNames(7);

      expect(result).toEqual(new Set(['role:create', 'role:update']));
      expect(
        authorizationRepository.findPermissionNamesByUserId,
      ).not.toHaveBeenCalled();
      expect(permissionsCache.set).not.toHaveBeenCalled();
    });

    it('CACHE MISS: fallback query DB, lalu isi cache untuk request berikutnya', async () => {
      const { service, authorizationRepository, permissionsCache } =
        createService();
      permissionsCache.get.mockResolvedValue(null);
      authorizationRepository.findPermissionNamesByUserId.mockResolvedValue([
        'role:create',
      ]);

      const result = await service.getUserPermissionNames(7);

      expect(
        authorizationRepository.findPermissionNamesByUserId,
      ).toHaveBeenCalledWith(7);
      expect(permissionsCache.set).toHaveBeenCalledWith(7, ['role:create']);
      expect(result).toEqual(new Set(['role:create']));
    });

    it('CACHE HIT dengan array kosong: user memang tidak punya permission, tetap tidak query DB', async () => {
      const { service, authorizationRepository, permissionsCache } =
        createService();
      permissionsCache.get.mockResolvedValue([]);

      const result = await service.getUserPermissionNames(7);

      expect(result).toEqual(new Set());
      expect(
        authorizationRepository.findPermissionNamesByUserId,
      ).not.toHaveBeenCalled();
    });

    it('dedup permission yang sama dari beberapa role jadi satu Set (perilaku lama tetap konsisten)', async () => {
      const { service, authorizationRepository, permissionsCache } =
        createService();
      permissionsCache.get.mockResolvedValue(null);
      authorizationRepository.findPermissionNamesByUserId.mockResolvedValue([
        'role:create',
        'role:create',
        'role:update',
      ]);

      const result = await service.getUserPermissionNames(7);

      expect(result).toEqual(new Set(['role:create', 'role:update']));
      expect(result.size).toBe(2);
    });
  });
});
