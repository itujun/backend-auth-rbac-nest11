import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly adminChatId: string;

  constructor(private readonly configService: ConfigService) {
    this.botToken = this.configService.get<string>(
      'telegram.botToken',
    ) as string;
    this.adminChatId = this.configService.get<string>(
      'telegram.adminChatId',
    ) as string;
  }

  /**
   * Kirim pesan teks ke chat admin yang dikonfigurasi via Telegram Bot
   * API (`sendMessage`, panggilan HTTP langsung -- tidak pakai library
   * bot terpisah, lihat pembahasan desain di sesi sebelumnya).
   *
   * SENGAJA tidak pernah melempar exception ke pemanggil -- notifikasi
   * ini bukan bagian esensial dari flow bisnis (mis. registrasi user
   * TETAP harus dianggap berhasil walau Telegram API sedang down atau
   * timeout). Pola sama persis dengan `AuditLogService.record()`: aman
   * untuk di-`await` langsung tanpa try-catch tambahan di pemanggil,
   * karena method ini menjamin selalu resolve, tidak pernah reject.
   */
  async notifyAdmin(message: string): Promise<void> {
    const url = `${TELEGRAM_API_BASE}/bot${this.botToken}/sendMessage`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.adminChatId,
          text: message,
        }),
      });

      if (!response.ok) {
        // Telegram API tetap balas HTTP 200 untuk sebagian besar kasus
        // sukses, tapi non-2xx (mis. bot token salah, chat_id tidak
        // valid/bot belum pernah di-chat oleh admin) selalu disertai
        // body JSON berisi field "description" yang jelas -- log
        // body-nya, bukan cuma status code mentah, biar gampang
        // di-debug tanpa perlu reproduce manual.
        const body = await response.text();
        this.logger.error(
          `Gagal kirim notifikasi Telegram (HTTP ${response.status}): ${body}`,
        );
        return;
      }
    } catch (err) {
      // Beda dari response non-2xx di atas -- ini kegagalan di level
      // network (timeout, DNS gagal, dst). Perlakuannya sama: log,
      // jangan throw.
      this.logger.error(`Gagal kirim notifikasi Telegram: ${String(err)}`);
    }
  }
}
