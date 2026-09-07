import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { HashingService } from '../../core/hashing/hashing.service';
import { RefreshTokensService } from './refresh-tokens/refresh-tokens.service';
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
  const refreshTokensService = {
    issue: issueMock,
  } as unknown as RefreshTokensService;

  const authService = new AuthService(
    usersService,
    hashingService,
    jwtService,
    refreshTokensService,
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
      const { authService, findByEmailMock, hashMock, createWithProfileMock } =
        createAuthService();
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
    });
  });

  describe('login', () => {
    it('menolak dengan pesan generik kalau email tidak terdaftar (anti-enumeration)', async () => {
      const { authService, findByEmailMock } = createAuthService();
      findByEmailMock.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'tidak-ada@example.com', password: 'x' }),
      ).rejects.toThrow(new UnauthorizedException('Email atau password salah'));
    });

    it('menolak dengan pesan generik YANG SAMA kalau password salah (anti-enumeration)', async () => {
      const { authService, findByEmailMock, compareMock } = createAuthService();
      findByEmailMock.mockResolvedValue(fakeUser());
      compareMock.mockResolvedValue(false);

      await expect(
        authService.login({ email: 'budi@example.com', password: 'salah' }),
      ).rejects.toThrow(new UnauthorizedException('Email atau password salah'));
    });

    it('menolak login untuk akun nonaktif (isActive: false)', async () => {
      const { authService, findByEmailMock } = createAuthService();
      findByEmailMock.mockResolvedValue(fakeUser({ isActive: false }));

      await expect(
        authService.login({ email: 'budi@example.com', password: 'x' }),
      ).rejects.toThrow(new UnauthorizedException('Akun tidak aktif'));
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
    });
  });
});
