/**
 * Konfigurasi diakses lewat ConfigService dengan namespace (mis. `app.port`,
 * `database.url`) alih-alih `process.env.PORT` yang tersebar di banyak
 * tempat. Ini memudahkan testing (gampang mock) dan refactor.
 */
export default () => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    // Default: aktif di semua environment SELAIN production. Di production
    // tetap bisa dipaksa aktif via ENABLE_SWAGGER=true kalau memang perlu
    // (mis. portofolio yang sengaja dipamerkan publik) — tapi sadari
    // konsekuensinya: seluruh shape API (termasuk DTO) jadi ter-expose.
    swaggerEnabled:
      process.env.ENABLE_SWAGGER !== undefined
        ? process.env.ENABLE_SWAGGER === 'true'
        : process.env.NODE_ENV !== 'production',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  cookie: {
    refreshTokenName: process.env.REFRESH_TOKEN_COOKIE_NAME ?? 'refresh_token',
  },
  storage: {
    uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  },
});

export type AppConfig = ReturnType<typeof import('./configuration').default>;
