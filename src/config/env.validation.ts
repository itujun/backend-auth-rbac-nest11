import * as Joi from 'joi';

/**
 * Skema validasi environment variable.
 *
 * Kenapa perlu ini?
 * - Best practice: aplikasi HARUS gagal start (fail fast) kalau ada env
 *   yang wajib tapi tidak diisi, daripada baru error saat runtime di
 *   endpoint tertentu (misal JWT_SECRET undefined baru ketahuan pas ada
 *   yang login).
 * - Satu sumber kebenaran untuk semua env yang dibutuhkan aplikasi.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  // Database
  DATABASE_URL: Joi.string().uri().required(),

  // JWT
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  REFRESH_TOKEN_COOKIE_NAME: Joi.string().default('refresh_token'),

  // Storage -- default avatar (bundled asset) saja, BUKAN avatar upload user
  UPLOAD_DIR: Joi.string().default('uploads'),

  // Cloudflare R2 (object storage untuk avatar upload user). WAJIB diisi
  // -- beda filosofi dengan Redis di bawah: tanpa R2 aplikasi TIDAK BISA
  // menjalankan fitur upload/reset avatar sama sekali (bukan sekadar
  // optimasi opsional), jadi harus fail-fast di boot time, bukan baru
  // error 500 saat user pertama kali upload.
  R2_ACCOUNT_ID: Joi.string().required(),
  R2_ACCESS_KEY_ID: Joi.string().required(),
  R2_SECRET_ACCESS_KEY: Joi.string().required(),
  R2_BUCKET_NAME: Joi.string().required(),
  R2_PUBLIC_URL: Joi.string().uri().required(),

  // Telegram Bot API (notifikasi admin saat ada registrasi user baru).
  // WAJIB diisi -- filosofinya SAMA dengan R2: kalau fitur ini memang
  // dipakai di deployment ini, salah konfigurasi (token/chat ID kosong
  // atau typo) harus ketahuan SAAT BOOT, bukan diam-diam gagal terus
  // baru ketahuan pas ada yang komplain "kok gak ada notif masuk".
  // CATATAN: ini beda level dengan TelegramService.notifyAdmin() yang
  // best-effort di RUNTIME (lihat komentar di service-nya) -- fail-fast
  // di sini cuma menjamin ENV-nya valid, bukan menjamin Telegram API
  // akan selalu berhasil dipanggil.
  TELEGRAM_BOT_TOKEN: Joi.string().required(),
  TELEGRAM_ADMIN_CHAT_ID: Joi.string().required(),

  // SMTP (pengiriman email -- forgot password, lihat modules/mail).
  // Opsional dengan default yang match Maildev di docker-compose.yml --
  // SENGAJA beda filosofi dari R2/Telegram (.required()) supaya
  // `npm run start:dev` langsung jalan tanpa perlu edit .env dulu,
  // selama `docker compose up -d maildev` sudah dijalankan. Ganti ke
  // kredensial provider asli (Resend/SendGrid/dst) kapan saja tanpa
  // ubah kode sama sekali, cuma env var ini.
  SMTP_HOST: Joi.string().default('localhost'),
  SMTP_PORT: Joi.number().port().default(1025),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASSWORD: Joi.string().allow('').optional(),
  SMTP_FROM: Joi.string().default(
    '"Access Console" <no-reply@access-console.local>',
  ),

  // Redis (cache-aside untuk permission checks, lihat AuthorizationService).
  // Semua opsional dengan default -- SENGAJA tidak `.required()`, karena
  // Redis di project ini murni optimasi, bukan dependency wajib untuk
  // aplikasi bisa hidup (beda filosofi dengan DATABASE_URL di atas).
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().integer().min(0).max(15).default(0),
  REDIS_KEY_PREFIX: Joi.string().default('rbac:'),
  REDIS_PERMISSIONS_TTL_SECONDS: Joi.number().integer().positive().default(300),

  // CORS
  // Comma-separated untuk >1 origin (mis. dev + E2E test) -- di-parse
  // jadi array di configuration.ts. Tetap Joi.string() di sini karena
  // env var mentahnya memang selalu satu string, splitting terjadi
  // setelahnya, bukan di layer validasi ini.
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),

  // Swagger — opsional, default mengikuti NODE_ENV (lihat configuration.ts)
  ENABLE_SWAGGER: Joi.boolean().optional(),

  // Rate limiting global (endpoint sensitif punya limit sendiri, lihat auth.controller.ts)
  THROTTLE_TTL_MS: Joi.number().integer().positive().default(60000),
  THROTTLE_LIMIT: Joi.number().integer().positive().default(100),

  // Logging (nestjs-pino). Keduanya opsional — default mengikuti
  // NODE_ENV (lihat configuration.ts).
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
    .optional(),
  LOG_PRETTY: Joi.boolean().optional(),
}).unknown(true); // izinkan env lain (mis. dari OS/CI) yang tidak kita definisikan

/**
 * @nestjs/config v12 mengganti `validationSchema` jadi mengharapkan
 * Standard Schema (Zod/Valibot/dst), sedangkan Joi belum mengikuti spek
 * tersebut. Solusinya: pakai opsi `validate` (custom function) dan
 * jalankan Joi secara manual di dalamnya — tetap fail-fast di boot time,
 * cuma cara pasangnya yang beda.
 */
export function validateEnv(config: Record<string, unknown>) {
  const result: Joi.ValidationResult = envValidationSchema.validate(config, {
    abortEarly: false,
  });
  const error: Joi.ValidationError | undefined = result.error;
  const value: unknown = result.value;

  if (error) {
    throw new Error(
      `Konfigurasi environment tidak valid:\n${error.details
        .map((d) => `  - ${d.message}`)
        .join('\n')}`,
    );
  }

  return value as Record<string, unknown>;
}
