import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { TelegramService } from './telegram.service';

const TEST_BOT_TOKEN = 'test-bot-token';
const TEST_ADMIN_CHAT_ID = '123456789';
const EXPECTED_URL = `https://api.telegram.org/bot${TEST_BOT_TOKEN}/sendMessage`;

function createService() {
  const config: Record<string, unknown> = {
    'telegram.botToken': TEST_BOT_TOKEN,
    'telegram.adminChatId': TEST_ADMIN_CHAT_ID,
  };
  const getMock = jest.fn((key: string) => config[key]);
  const configService = { get: getMock } as unknown as ConfigService;
  const service = new TelegramService(configService);
  return { service };
}

describe('TelegramService', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // global.fetch di-spy langsung -- TIDAK jest.mock('node-fetch') atau
    // sejenisnya, karena service ini SENGAJA memakai fetch BAWAAN Node 22
    // (tanpa library bot terpisah, lihat pembahasan desain di README) --
    // jadi yang perlu di-mock memang global fetch itu sendiri.
    fetchSpy = jest.spyOn(global, 'fetch');
    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('notifyAdmin', () => {
    it('memanggil endpoint sendMessage Telegram dengan token, chat ID, dan teks yang benar', async () => {
      const { service } = createService();
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      await service.notifyAdmin('Pesan tes');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(EXPECTED_URL);
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string) as {
        chat_id: string;
        text: string;
      };
      expect(body.chat_id).toBe(TEST_ADMIN_CHAT_ID);
      expect(body.text).toBe('Pesan tes');
    });

    it('TIDAK melempar error kalau Telegram API balas non-2xx (mis. chat ID salah/bot belum pernah di-chat) -- cukup di-log', async () => {
      const { service } = createService();
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({ ok: false, description: 'chat not found' }),
          { status: 400 },
        ),
      );

      await expect(service.notifyAdmin('Pesan tes')).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('chat not found'),
      );
    });

    it('TIDAK melempar error kalau fetch gagal di level network (timeout, DNS, dst) -- cukup di-log', async () => {
      const { service } = createService();
      fetchSpy.mockRejectedValue(new Error('network error / timeout'));

      await expect(service.notifyAdmin('Pesan tes')).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('network error / timeout'),
      );
    });

    it('mengirim pesan multi-baris apa adanya (dipisah \\n)', async () => {
      const { service } = createService();
      fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

      await service.notifyAdmin('Baris 1\nBaris 2');

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as { text: string };
      expect(body.text).toBe('Baris 1\nBaris 2');
    });
  });
});
