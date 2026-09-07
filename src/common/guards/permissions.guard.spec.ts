import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { AuthorizationService } from '../../core/authorization/authorization.service';

// Referensi TETAP (bukan `() => jest.fn()` yang bikin instance baru tiap
// panggilan) — supaya `context.getHandler()` di dalam guard DAN di
// asersi test sama-sama merujuk objek yang identik.
const handlerRef = () => undefined;
const classRef = () => undefined;

function createContext(user?: { id: number }): ExecutionContext {
  return {
    getHandler: () => handlerRef,
    getClass: () => classRef,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

/**
 * Kedua mock function (`getAllAndOverrideMock`,
 * `getUserPermissionNamesMock`) SENGAJA jadi variabel terpisah dari
 * awal — bukan diakses lewat `reflector.getAllAndOverride` /
 * `authorizationService.getUserPermissionNames` di titik pemakaian.
 * Referensi method lepas dari objeknya (typed lewat class asli) kena
 * @typescript-eslint/unbound-method.
 */
function setup(requiredPermissions: string[] | undefined) {
  const getAllAndOverrideMock = jest.fn().mockReturnValue(requiredPermissions);
  const reflector = {
    getAllAndOverride: getAllAndOverrideMock,
  } as unknown as Reflector;

  const getUserPermissionNamesMock = jest.fn();
  const authorizationService = {
    getUserPermissionNames: getUserPermissionNamesMock,
  } as unknown as AuthorizationService;

  const guard = new PermissionsGuard(reflector, authorizationService);

  return { guard, getAllAndOverrideMock, getUserPermissionNamesMock };
}

describe('PermissionsGuard', () => {
  it('meloloskan tanpa cek apapun kalau route tidak punya @RequirePermission()', async () => {
    const { guard, getAllAndOverrideMock, getUserPermissionNamesMock } =
      setup(undefined);
    const context = createContext({ id: 1 });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(getAllAndOverrideMock).toHaveBeenCalledWith(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    expect(getUserPermissionNamesMock).not.toHaveBeenCalled();
  });

  it('meloloskan kalau @RequirePermission() array-nya kosong', async () => {
    const { guard, getUserPermissionNamesMock } = setup([]);

    const result = await guard.canActivate(createContext({ id: 1 }));

    expect(result).toBe(true);
    expect(getUserPermissionNamesMock).not.toHaveBeenCalled();
  });

  it('menolak dengan UnauthorizedException kalau request.user tidak ada', async () => {
    const { guard } = setup(['role:create']);

    await expect(guard.canActivate(createContext(undefined))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('meloloskan kalau user punya SEMUA permission yang dibutuhkan', async () => {
    const { guard, getUserPermissionNamesMock } = setup([
      'role:create',
      'role:update',
    ]);
    getUserPermissionNamesMock.mockResolvedValue(
      new Set(['role:create', 'role:update', 'role:delete']),
    );

    const result = await guard.canActivate(createContext({ id: 7 }));

    expect(result).toBe(true);
    expect(getUserPermissionNamesMock).toHaveBeenCalledWith(7);
  });

  it('menolak dengan ForbiddenException + daftar permission yang kurang', async () => {
    const { guard, getUserPermissionNamesMock } = setup([
      'role:create',
      'role:manage-permissions',
    ]);
    getUserPermissionNamesMock.mockResolvedValue(new Set(['role:create']));

    await expect(guard.canActivate(createContext({ id: 7 }))).rejects.toThrow(
      new ForbiddenException(
        'Anda tidak memiliki izin: role:manage-permissions',
      ),
    );
  });
});
