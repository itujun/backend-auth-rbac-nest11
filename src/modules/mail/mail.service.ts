import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Wrapper tipis di atas Nodemailer. SENGAJA generic (`sendMail` polos,
 * bukan `sendPasswordResetEmail()` langsung di sini) -- MailService
 * cuma urusan "bagaimana cara mengirim", bukan "kapan/kenapa dikirim"
 * atau isi templat email tertentu. Modul lain (nanti AuthService untuk
 * forgot-password) yang menyusun subject/html lalu panggil method ini.
 *
 * Transport dev: Maildev (SMTP lokal via Docker, lihat docker-compose.yml)
 * -- TIDAK mengirim email sungguhan, cuma menangkapnya untuk dilihat di
 * http://localhost:1080. Ganti SMTP_HOST/PORT/USER/PASSWORD di .env ke
 * provider asli (mis. Resend/SendGrid) untuk pindah ke pengiriman
 * sungguhan -- kode di service ini TIDAK perlu berubah sama sekali,
 * cuma env var-nya.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter!: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.from = this.configService.get<string>('mail.from') as string;
  }

  onModuleInit() {
    const host = this.configService.get<string>('mail.host') as string;
    const port = this.configService.get<number>('mail.port') as number;
    const secure = this.configService.get<boolean>('mail.secure') as boolean;
    const user = this.configService.get<string>('mail.user');
    const password = this.configService.get<string>('mail.password');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      // Maildev tidak butuh auth sama sekali -- auth cuma disertakan
      // kalau SMTP_USER diisi (mis. saat sudah pindah ke provider asli
      // yang mewajibkan login, seperti Resend/SendGrid).
      auth: user ? { user, pass: password } : undefined,
    });

    this.logger.log(`Mail transport siap: ${host}:${port} (secure=${secure})`);
  }

  /**
   * TIDAK best-effort seperti `TelegramService.notifyAdmin()` -- kegagalan
   * di sini dibiarkan throw ke pemanggil. Alasannya beda: notifikasi
   * Telegram ke admin memang murni opsional (proses bisnis utama tetap
   * valid walau gagal), tapi kalau email reset password gagal terkirim,
   * pemanggil (AuthService) PERLU tahu supaya bisa memutuskan sendiri
   * cara menangani -- biasanya: tetap balas generic success ke client
   * (anti user-enumeration), tapi log error-nya untuk ops. Lihat
   * AuthService.forgotPassword() di Tahap B.
   */
  async sendMail(options: SendMailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
  }
}
