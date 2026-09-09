import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RefreshTokensService } from './refresh-tokens.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { hashToken } from '../utils/hash-token.util';

function createService() {
  const createMock = jest.fn();
  const findByTokenHashMock = jest.fn();
  const revokeMock = jest.fn().mockResolvedValue(undefined);
  const revokeAllForUserMock = jest.fn().mockResolvedValue(undefined);
  const repository = {
    create: createMock,
    findByTokenHash: findByTokenHashMock,
    revoke: revokeMock,
    revokeAllForUser: revokeAllForUserMock,
  } as unknown as RefreshTokensRepository;

  const getMock = jest.fn().mockReturnValue('7d'); // jwt.refreshExpiresIn
  const configService = { get: getMock } as unknown as ConfigService;

  const service = new RefreshTokensService(repository, configService);

  return {
    service,
    createMock,
    findByTokenHashMock,
    revokeMock,
    revokeAllForUserMock,
  };
}

describe('RefreshTokensService', () => {
  describe('issue', () => {
    it('membuat token baru: raw token di-hash sebelum disimpan ke repository', async () => {
      const { service, createMock } = createService();
      createMock.mockImplementation((input: { expiresAt: Date }) =>
        Promise.resolve({ id: 1, ...input }),
      );

      const result = await service.issue(5, { ipAddress: '127.0.0.1' });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 5, ipAddress: '127.0.0.1' }),
      );
      // Raw token yang dikembalikan ke caller HARUS beda dari yang
      // disimpan ke DB (yang disimpan adalah hash-nya) — ini inti
      // keamanan refresh token: kalau DB bocor, attacker cuma dapat
      // hash, bukan token asli yang bisa langsung dipakai.
      const calls = createMock.mock.calls as unknown as [
        { tokenHash: string },
      ][];
      const savedInput = calls[0][0];
      expect(savedInput.tokenHash).toBe(hashToken(result.rawToken));
      expect(savedInput.tokenHash).not.toBe(result.rawToken);
    });
  });

  describe('rotate', () => {
    it('menolak dengan pesan generik kalau token tidak ditemukan', async () => {
      const { service, findByTokenHashMock } = createService();
      findByTokenHashMock.mockResolvedValue(undefined);

      await expect(service.rotate('token-asing')).rejects.toThrow(
        new UnauthorizedException('Sesi tidak valid, silakan login ulang'),
      );
    });

    it('mendeteksi REUSE token yang sudah di-revoke: revoke SEMUA sesi user & tolak', async () => {
      const { service, findByTokenHashMock, revokeAllForUserMock } =
        createService();
      findByTokenHashMock.mockResolvedValue({
        id: 1,
        userId: 5,
        isRevoked: true,
        expiresAt: new Date(Date.now() + 100_000),
      });

      await expect(service.rotate('token-lama-yang-dicuri')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(revokeAllForUserMock).toHaveBeenCalledWith(5);
    });

    it('menolak & revoke token yang sudah kadaluarsa (tanpa revoke sesi lain)', async () => {
      const { service, findByTokenHashMock, revokeMock, revokeAllForUserMock } =
        createService();
      findByTokenHashMock.mockResolvedValue({
        id: 1,
        userId: 5,
        isRevoked: false,
        expiresAt: new Date(Date.now() - 1000), // sudah lewat
      });

      await expect(service.rotate('token-expired')).rejects.toThrow(
        new UnauthorizedException('Sesi telah berakhir, silakan login ulang'),
      );
      expect(revokeMock).toHaveBeenCalledWith(1);
      expect(revokeAllForUserMock).not.toHaveBeenCalled();
    });

    it('rotasi sukses: terbitkan token baru & sambungkan rantai (replacedById)', async () => {
      const { service, findByTokenHashMock, createMock, revokeMock } =
        createService();
      findByTokenHashMock.mockResolvedValue({
        id: 1,
        userId: 5,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 100_000),
      });
      createMock.mockImplementation((input: { expiresAt: Date }) =>
        Promise.resolve({ id: 2, ...input }),
      );

      const result = await service.rotate('token-valid');

      expect(result.userId).toBe(5);
      // Token lama (id: 1) di-revoke DAN ditandai digantikan token baru (id: 2)
      expect(revokeMock).toHaveBeenCalledWith(1, 2);
    });
  });

  describe('revoke (logout satu sesi)', () => {
    it('idempotent — kembalikan null (bukan error) kalau token sudah tidak ada', async () => {
      const { service, findByTokenHashMock, revokeMock } = createService();
      findByTokenHashMock.mockResolvedValue(undefined);

      await expect(service.revoke('token-tidak-dikenal')).resolves.toBeNull();
      expect(revokeMock).not.toHaveBeenCalled();
    });

    it('revoke row yang sesuai & kembalikan userId pemiliknya', async () => {
      const { service, findByTokenHashMock, revokeMock } = createService();
      findByTokenHashMock.mockResolvedValue({
        id: 9,
        userId: 42,
        isRevoked: false,
      });

      const result = await service.revoke('token-aktif');

      expect(revokeMock).toHaveBeenCalledWith(9);
      expect(result).toEqual({ userId: 42 });
    });
  });

  describe('revokeAllForUser', () => {
    it('mendelegasikan langsung ke repository.revokeAllForUser()', async () => {
      const { service, revokeAllForUserMock } = createService();

      await service.revokeAllForUser(5);

      expect(revokeAllForUserMock).toHaveBeenCalledWith(5);
    });
  });
});
