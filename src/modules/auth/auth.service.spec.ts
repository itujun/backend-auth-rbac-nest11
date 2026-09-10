import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { HashingService } from '../../core/hashing/hashing.service';
import { RefreshTokensService } from './refresh-tokens/refresh-tokens.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { User } from '../../database/schema';

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: 'budi@example.com',
    passwordHash: 'hashed:password123',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Semua dependency AuthService di-mock manual (bukan `Test.createTestingModule`)
 * — untuk unit test service sesederhana ini, DI container NestJS cuma
 * overhead. Tiap mock function jadi variabel terpisah dari awal (bukan
 * diakses lewat `object.method` di titik pemakaian) — lihat komentar
 * serupa di guard spec soal @typescript-eslint/unbound-method.
 */
function createAuthService() {
  const findByEmailMock = jest.fn();
  const createWithProfileMock = jest.fn();
  const findActiveByIdMock = jest.fn();
  const sanitizeMock = jest.fn((user: User) => {
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  });
  const usersService = {
    findByEmail: findByEmailMock,
    createWithProfile: createWithProfileMock,
    findActiveById: findActiveByIdMock,
    sanitize: sanitizeMock,
  } as unknown as UsersService;

  const hashMock = jest.fn().mockResolvedValue('hashed:password123');
  const compareMock = jest.fn();
  const hashingService = {
    hash: hashMock,
    compare: compareMock,
  } as unknown as HashingService;

  const signAsyncMock = jest.fn().mockResolvedValue('fake-access-token');
  const jwtService = { signAsync: signAsyncMock } as unknown as JwtService;

  const issueMock = jest.fn().mockResolvedValue({
    id: 99,
    rawToken: 'fake-refresh-token',
    expiresAt: new Date('2026-02-01'),
  });
  const rotateMock = jest.fn();
  const revokeMock = jest.fn();
  const revokeAllForUserMock = jest.fn();
  const refreshTokensService = {
    issue: issueMock,
    rotate: rotateMock,
    revoke: revokeMock,
    revokeAllForUser: revokeAllForUserMock,
  } as unknown as RefreshTokensService;

  const recordMock = jest.fn().mockResolvedValue(undefined);
  const auditLogService = { record: recordMock } as unknown as AuditLogService;

  const authService = new AuthService(
    usersService,
    hashingService,
    jwtService,
    refreshTokensService,
    auditLogService,
  );

  return {
    authService,
    findByEmailMock,
    createWithProfileMock,
    findActiveByIdMock,
    sanitizeMock,
    hashMock,
    compareMock,
    signAsyncMock,
    issueMock,
    recordMock,
    rotateMock,
    revokeMock,
    revokeAllForUserMock,
  };
}

describe('AuthService', () => {
  describe('register', () => {
    it('menolak dengan ConflictException kalau email sudah terdaftar', async () => {
      const { authService, findByEmailMock, createWithProfileMock } =
        createAuthService();
      findByEmailMock.mockResolvedValue(fakeUser());

      await expect(
        authService.register({
          email: 'budi@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
      expect(createWithProfileMock).not.toHaveBeenCalled();
    });

    it('hash password lalu buat user+profile, dan hasilnya TIDAK mengandung passwordHash', async () => {
      const {
        authService,
        findByEmailMock,
        hashMock,
        createWithProfileMock,
        recordMock,
      } = createAuthService();
      findByEmailMock.mockResolvedValue(null);
      createWithProfileMock.mockResolvedValue(fakeUser());

      const result = await authService.register({
        email: 'budi@example.com',
        password: 'password123',
        fullName: 'Budi Santoso',
      });

      expect(hashMock).toHaveBeenCalledWith('password123');
      expect(createWithProfileMock).toHaveBeenCalledWith({
        email: 'budi@example.com',
        passwordHash: 'hashed:password123',
        fullName: 'Budi Santoso',
      });
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe('budi@example.com');
      expect(recordMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.register', actorUserId: 1 }),
      );
    });
  });

  describe('login', () => {
    it('menolak dengan pesan generik kalau email tidak terdaftar (anti-enumeration)', async () => {
      const { authService, findByEmailMock, recordMock } = createAuthService();
      findByEmailMock.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'tidak-ada@example.com', password: 'x' }),
      ).rejects.toThrow(new UnauthorizedException('Email atau password salah'));
      expect(recordMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.login_failed',
          actorEmail: 'tidak-ada@example.com',
          metadata: { reason: 'user_not_found' },
        }),
      );
    });

    it('menolak dengan pesan generik YANG SAMA kalau password salah (anti-enumeration)', async () => {
      const { authService, findByEmailMock, compareMock, recordMock } =
        createAuthService();
      findByEmailMock.mockResolvedValue(fakeUser());
      compareMock.mockResolvedValue(false);

      await expect(
        authService.login({ email: 'budi@example.com', password: 'salah' }),
      ).rejects.toThrow(new UnauthorizedException('Email atau password salah'));
      expect(recordMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.login_failed',
          metadata: { reason: 'invalid_password' },
        }),
      );
    });

    it('menolak login untuk akun nonaktif (isActive: false)', async () => {
      const { authService, findByEmailMock, recordMock } = createAuthService();
      findByEmailMock.mockResolvedValue(fakeUser({ isActive: false }));

      await expect(
        authService.login({ email: 'budi@example.com', password: 'x' }),
      ).rejects.toThrow(new UnauthorizedException('Akun tidak aktif'));
      expect(recordMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.login_failed',
          metadata: { reason: 'account_inactive' },
        }),
      );
    });

    it('menolak login untuk akun yang sudah soft-deleted', async () => {
      const { authService, findByEmailMock } = createAuthService();
      findByEmailMock.mockResolvedValue(fakeUser({ deletedAt: new Date() }));

      await expect(
        authService.login({ email: 'budi@example.com', password: 'x' }),
      ).rejects.toThrow(new UnauthorizedException('Akun tidak aktif'));
    });

    it('login sukses: kembalikan accessToken + refreshToken + user tersanitasi', async () => {
      const {
        authService,
        findByEmailMock,
        compareMock,
        signAsyncMock,
        issueMock,
        recordMock,
      } = createAuthService();
      const user = fakeUser();
      findByEmailMock.mockResolvedValue(user);
      compareMock.mockResolvedValue(true);

      const result = await authService.login(
        { email: 'budi@example.com', password: 'password123' },
        { ipAddress: '127.0.0.1', userAgent: 'jest' },
      );

      expect(compareMock).toHaveBeenCalledWith(
        'password123',
        user.passwordHash,
      );
      expect(signAsyncMock).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
      });
      expect(issueMock).toHaveBeenCalledWith(user.id, {
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      });
      expect(result).toMatchObject({
        accessToken: 'fake-access-token',
        refreshToken: 'fake-refresh-token',
      });
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(recordMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.login_success',
          actorUserId: user.id,
        }),
      );
    });
  });

  describe('refresh', () => {
    it('rotasi token lalu terbitkan access token baru untuk user yang masih aktif', async () => {
      const { authService, rotateMock, findActiveByIdMock, signAsyncMock } =
        createAuthService();
      const user = fakeUser();
      const newRefreshToken = {
        id: 100,
        rawToken: 'new-raw-token',
        expiresAt: new Date('2026-03-01'),
      };
      rotateMock.mockResolvedValue({
        userId: user.id,
        refreshToken: newRefreshToken,
      });
      findActiveByIdMock.mockResolvedValue(user);

      const result = await authService.refresh('old-raw-token', {
        ipAddress: '127.0.0.1',
      });

      expect(rotateMock).toHaveBeenCalledWith('old-raw-token', {
        ipAddress: '127.0.0.1',
      });
      expect(findActiveByIdMock).toHaveBeenCalledWith(user.id);
      expect(signAsyncMock).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
      });
      expect(result).toEqual({
        accessToken: 'fake-access-token',
        refreshToken: 'new-raw-token',
        refreshTokenExpiresAt: newRefreshToken.expiresAt,
      });
    });

    it('revoke semua sesi & tolak kalau user sudah dihapus/nonaktif setelah rotasi berhasil', async () => {
      const {
        authService,
        rotateMock,
        findActiveByIdMock,
        revokeAllForUserMock,
      } = createAuthService();
      rotateMock.mockResolvedValue({
        userId: 42,
        refreshToken: { id: 1, rawToken: 'x', expiresAt: new Date() },
      });
      findActiveByIdMock.mockResolvedValue(null); // user dihapus/nonaktif

      await expect(authService.refresh('raw-token')).rejects.toThrow(
        new UnauthorizedException('User tidak ditemukan atau tidak aktif'),
      );
      expect(revokeAllForUserMock).toHaveBeenCalledWith(42);
    });

    it('meneruskan (tidak menelan) exception dari rotate() — mis. token invalid/reuse', async () => {
      const { authService, rotateMock } = createAuthService();
      rotateMock.mockRejectedValue(
        new UnauthorizedException('Sesi tidak valid, silakan login ulang'),
      );

      await expect(authService.refresh('raw-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('mendelegasikan ke refreshTokensService.revoke() & catat audit log dgn actor yang benar', async () => {
      const { authService, revokeMock, recordMock } = createAuthService();
      revokeMock.mockResolvedValue({ userId: 1 });

      await authService.logout('raw-token-dari-cookie');

      expect(revokeMock).toHaveBeenCalledWith('raw-token-dari-cookie');
      expect(recordMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.logout', actorUserId: 1 }),
      );
    });

    it('TIDAK mencatat audit log kalau token sudah tidak valid (revoke() kembalikan null)', async () => {
      const { authService, revokeMock, recordMock } = createAuthService();
      revokeMock.mockResolvedValue(null);

      // Tidak boleh throw walau tidak ada userId untuk audit log
      await expect(authService.logout('token-basi')).resolves.toBeUndefined();
      expect(recordMock).not.toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('mendelegasikan ke revokeAllForUser() & catat audit log dgn actor yang benar', async () => {
      const { authService, revokeAllForUserMock, recordMock } =
        createAuthService();
      revokeAllForUserMock.mockResolvedValue(undefined);

      await authService.logoutAll(7);

      expect(revokeAllForUserMock).toHaveBeenCalledWith(7);
      expect(recordMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.logout_all', actorUserId: 7 }),
      );
    });
  });
});
