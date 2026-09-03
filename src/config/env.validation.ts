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

  // CORS
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
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
