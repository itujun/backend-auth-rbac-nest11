import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailVerificationTokensService } from './email-verification-tokens.service';
import { EmailVerificationTokensRepository } from './email-verification-tokens.repository';

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

describe('EmailVerificationTokensService', () => {
  let service: EmailVerificationTokensService;
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
          expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        }),
      consume: jest.fn<Promise<FakeConsumedRow | null>, [string]>(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        EmailVerificationTokensService,
        {
          provide: EmailVerificationTokensRepository,
          useValue: repository,
        },
        {
          provide: ConfigService,
          useValue: { get: () => '24h' },
        },
      ],
    }).compile();

    service = moduleRef.get(EmailVerificationTokensService);
  });

  describe('issue', () => {
    it('menginvalidasi token lama SEBELUM membuat yang baru', async () => {
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
          expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        });
      });

      await service.issue(7);

      expect(callOrder).toEqual(['invalidate', 'create']);
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

    it('mengembalikan null kalau token tidak dikenal/sudah dipakai/kedaluwarsa', async () => {
      repository.consume.mockResolvedValue(null);

      const result = await service.consume('token-invalid');

      expect(result).toBeNull();
    });

    it('mengirim HASH token ke repository, bukan token mentahnya', async () => {
      repository.consume.mockResolvedValue(null);

      const rawToken = 'contoh-token-mentah';
      await service.consume(rawToken);

      const [hashArg] = repository.consume.mock.calls[0];
      expect(hashArg).not.toBe(rawToken);
      expect(hashArg).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
