import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';

// Referensi TETAP (bukan `() => jest.fn()` yang bikin instance baru tiap
// panggilan) — supaya `context.getHandler()` di dalam guard DAN di
// asersi test sama-sama merujuk objek yang identik.
const handlerRef = () => undefined;
const classRef = () => undefined;

function createContext(): ExecutionContext {
  return {
    getHandler: () => handlerRef,
    getClass: () => classRef,
    switchToHttp: () => ({
      getRequest: () => ({ headers: {} }),
    }),
  } as unknown as ExecutionContext;
}

/**
 * `getAllAndOverrideMock` SENGAJA jadi variabel terpisah, bukan diakses
 * lewat `reflector.getAllAndOverride` di titik pemakaian/asersi —
 * referensi method lepas dari objeknya (typed lewat class asli
 * `Reflector`) kena @typescript-eslint/unbound-method.
 */
function createReflector(isPublic: boolean) {
  const getAllAndOverrideMock = jest.fn().mockReturnValue(isPublic);
  const reflector = {
    getAllAndOverride: getAllAndOverrideMock,
  } as unknown as Reflector;
  return { reflector, getAllAndOverrideMock };
}

/** Base class AuthGuard('jwt') adalah mixin dinamis — lihat komentar di bawah. */
function spyOnSuperCanActivate() {
  const basePrototype = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
    canActivate: (ctx: ExecutionContext) => boolean;
  };
  return jest.spyOn(basePrototype, 'canActivate');
}

describe('JwtAuthGuard', () => {
  afterEach(() => jest.restoreAllMocks());

  it('langsung meloloskan request tanpa cek JWT kalau route ditandai @Public()', () => {
    const { reflector, getAllAndOverrideMock } = createReflector(true);
    const guard = new JwtAuthGuard(reflector);

    // Spy dipasang TAPI TIDAK di-mock return value-nya — kalau isPublic
    // true, canActivate() HARUS return true tanpa pernah menyentuh
    // logic passport sama sekali (dibuktikan lewat 0 pemanggilan spy).
    const superSpy = spyOnSuperCanActivate();
    const context = createContext();

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(getAllAndOverrideMock).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    expect(superSpy).not.toHaveBeenCalled();
  });

  it('mendelegasikan ke AuthGuard("jwt") bawaan passport kalau route TIDAK public', () => {
    const { reflector } = createReflector(false);
    const guard = new JwtAuthGuard(reflector);

    const superSpy = spyOnSuperCanActivate().mockReturnValue(true);
    const context = createContext();

    const result = guard.canActivate(context);

    expect(superSpy).toHaveBeenCalledWith(context);
    expect(result).toBe(true);
  });
});
