import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PasswordResetTokensService } from './password-reset-tokens.service';
import { PasswordResetTokensRepository } from './password-reset-tokens.repository';

interface FakeCreateInput {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
}

interface FakeCreatedRow {
  id: number;
  userId: number;
  expiresAt: Date;
}

interface FakeConsumedRow {
  id: number;
  userId: number;
}

describe('PasswordResetTokensService', () => {
  let service: PasswordResetTokensService;
  // Di-generic-kan (bukan `jest.Mock` polos) SUPAYA `.mock.calls[0]`
  // punya tipe yang benar dari awal, bukan `any` -- file ini di bawah
  // `src/`, TETAP strict (beda dari `test/**/*.ts` yang sengaja
  // dilonggarkan khusus untuk E2E, lihat eslint.config.mjs). Bentuk
  // generic `<ReturnType, Args>` (BUKAN `<(args) => ReturnType>`) --
  // versi @types/jest di project ini cuma punya overload 0 atau 2 tipe
  // argumen, bukan 1.
  let repository: {
    invalidateAllForUser: jest.Mock<Promise<void>, [number]>;
    create: jest.Mock<Promise<FakeCreatedRow>, [FakeCreateInput]>;
    consume: jest.Mock<Promise<FakeConsumedRow | null>, [string]>;
  };

  beforeEach(async () => {
    repository = {
      invalidateAllForUser: jest
        .fn<Promise<void>, [number]>()
        .mockResolvedValue(undefined),
      create: jest
        .fn<Promise<FakeCreatedRow>, [FakeCreateInput]>()
        .mockResolvedValue({
          id: 1,
          userId: 7,
          expiresAt: new Date(Date.now() + 30 * 60_000),
        }),
      consume: jest.fn<Promise<FakeConsumedRow | null>, [string]>(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PasswordResetTokensService,
        { provide: PasswordResetTokensRepository, useValue: repository },
        {
          provide: ConfigService,
          useValue: { get: () => '30m' },
        },
      ],
    }).compile();

    service = moduleRef.get(PasswordResetTokensService);
  });

  describe('issue', () => {
    it('menginvalidasi token lama SEBELUM membuat yang baru (urutan penting)', async () => {
      const callOrder: string[] = [];
      repository.invalidateAllForUser.mockImplementation(() => {
        callOrder.push('invalidate');
        return Promise.resolve();
      });
      repository.create.mockImplementation(() => {
        callOrder.push('create');
        return Promise.resolve({
          id: 1,
          userId: 7,
          expiresAt: new Date(Date.now() + 30 * 60_000),
        });
      });

      await service.issue(7);

      expect(callOrder).toEqual(['invalidate', 'create']);
      expect(repository.invalidateAllForUser).toHaveBeenCalledWith(7);
    });

    it('mengembalikan rawToken berbeda tiap kali dipanggil (random, bukan deterministik)', async () => {
      const first = await service.issue(7);
      const second = await service.issue(7);

      expect(first.rawToken).not.toBe(second.rawToken);
      expect(first.rawToken).toMatch(/^[0-9a-f]{64}$/); // 32 byte hex = 64 karakter
    });

    it('TIDAK menyimpan rawToken ke repository -- yang disimpan harus hash-nya', async () => {
      const { rawToken } = await service.issue(7);

      const [createArg] = repository.create.mock.calls[0];
      expect(createArg.tokenHash).not.toBe(rawToken);
      expect(createArg.userId).toBe(7);
    });
  });

  describe('consume', () => {
    it('mengembalikan userId kalau repository menemukan token valid', async () => {
      repository.consume.mockResolvedValue({ id: 1, userId: 7 });

      const result = await service.consume('token-mentah-apa-saja');

      expect(result).toEqual({ userId: 7 });
    });

    it('mengembalikan null kalau repository tidak menemukan apa-apa (tidak dikenal/sudah dipakai/kedaluwarsa)', async () => {
      repository.consume.mockResolvedValue(null);

      const result = await service.consume('token-invalid');

      expect(result).toBeNull();
    });

    it('mengirim HASH token ke repository, bukan token mentahnya', async () => {
      repository.consume.mockResolvedValue(null);

      const rawToken = 'contoh-token-mentah';
      await service.consume(rawToken);

      // PENTING: repository.consume, BUKAN repository.create -- consume()
      // tidak pernah memanggil create() sama sekali, cek yang salah
      // (create) akan crash runtime karena mock itu tidak pernah
      // ter-panggil di test ini (.mock.calls[0] jadi undefined).
      const [hashArg] = repository.consume.mock.calls[0];
      expect(hashArg).not.toBe(rawToken);
      expect(hashArg).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
    });
  });
});
