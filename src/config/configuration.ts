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
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    // Kosong = tanpa auth, cocok untuk docker-compose.yml dev saat ini
    // (image `redis:7-alpine` tanpa `--requirepass`). Kalau nanti
    // deploy ke managed Redis (mis. Upstash/ElastiCache) yang mewajibkan
    // auth, tinggal isi env ini tanpa ubah kode.
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB ?? '0', 10),
    // Prefix semua key yang ditulis lewat REDIS_CLIENT ini -- berguna
    // kalau Redis instance yang sama nanti dipakai bareng aplikasi lain
    // (shared Redis di lingkungan yang lebih hemat biaya), supaya key
    // tidak saling tabrak/collide.
    keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'rbac:',
    // TTL default (detik) untuk entry cache permission -- jaring
    // pengaman kalau ada invalidation yang terlewat (lihat pembahasan
    // di AuthorizationService, Phase 6b). Invalidation eksplisit tetap
    // mekanisme UTAMA; TTL ini cuma cadangan.
    permissionsTtlSeconds: parseInt(
      process.env.REDIS_PERMISSIONS_TTL_SECONDS ?? '300',
      10,
    ),
  },
  throttle: {
    // Default global — endpoint sensitif (login/register/refresh) override
    // sendiri lewat @Throttle() langsung di controller (lihat komentar di
    // auth.controller.ts kenapa itu TIDAK bisa dibuat configurable lewat
    // env seperti ini).
    ttlMs: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
  logger: {
    level:
      process.env.LOG_LEVEL ??
      (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    // pino-pretty (format berwarna, human-readable) di development;
    // JSON mentah di production — JSON jauh lebih murah diproses log
    // aggregator (Loki/ELK/Datadog dst) dibanding parsing teks berwarna.
    pretty:
      process.env.LOG_PRETTY !== undefined
        ? process.env.LOG_PRETTY === 'true'
        : process.env.NODE_ENV !== 'production',
  },
});

export type AppConfig = ReturnType<typeof import('./configuration').default>;
