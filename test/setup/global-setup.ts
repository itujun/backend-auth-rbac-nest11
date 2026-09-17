import path from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
// Tipe globalThis.__E2E_PG_CONTAINER__ diambil dari augmentasi ambient di
// ./global.d.ts -- TIDAK perlu di-import eksplisit, file .d.ts otomatis
// ikut program TypeScript (lihat tsconfig.json, "test" tidak di-exclude).

/**
 * Dijalankan SEKALI oleh Jest sebelum semua file *.e2e-spec.ts di-load
 * (lihat "globalSetup" di jest-e2e.json) -- BUKAN per test file/per test
 * case. Satu container Postgres dipakai bersama oleh seluruh suite E2E
 * (lihat db-cleanup.ts untuk isolasi ANTAR test lewat TRUNCATE, bukan
 * container terpisah per test -- start container ~1-2 detik, terlalu
 * mahal kalau diulang tiap test case).
 *
 * Image sengaja `postgres:16-alpine`, SAMA PERSIS dengan docker-compose.yml
 * dev -- supaya perilaku Postgres yang dites identik dengan yang dipakai
 * sehari-hari, bukan versi default Testcontainers yang mungkin beda major
 * version.
 */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('rbac_db_test')
    .withUsername('rbac_test')
    .withPassword('rbac_test')
    .start();

  globalThis.__E2E_PG_CONTAINER__ = container;

  const connectionUri = container.getConnectionUri();

  // Env WAJIB (lihat env.validation.ts) di-set DI SINI, bukan file
  // .env.test statis -- DATABASE_URL baru diketahui SETELAH container
  // jalan (port host-nya random tiap run, ini SENGAJA dari Testcontainers
  // supaya banyak test run bisa paralel di mesin/CI yang sama tanpa
  // rebutan port statis).
  process.env.DATABASE_URL = connectionUri;
  process.env.JWT_ACCESS_SECRET =
    'e2e_test_secret_do_not_use_in_production_1234567890';

  // R2 (object storage avatar) -- WAJIB diisi supaya lolos validasi Joi
  // di env.validation.ts (fail-fast), TAPI nilainya sengaja PALSU/dummy.
  // Aman: tidak ada test E2E saat ini yang benar-benar memanggil endpoint
  // upload/reset avatar (AvatarStorageService.onModuleInit() cuma copy
  // file avatar default ke disk lokal, TIDAK memanggil R2 API; S3Client
  // sendiri juga tidak melakukan network call apapun cuma dari
  // diinstansiasi -- AWS SDK v3 selalu lazy, baru benar-benar connect
  // saat command dikirim).
  process.env.R2_ACCOUNT_ID = 'e2e-dummy-account-id';
  process.env.R2_ACCESS_KEY_ID = 'e2e-dummy-access-key-id';
  process.env.R2_SECRET_ACCESS_KEY = 'e2e-dummy-secret-access-key';
  process.env.R2_BUCKET_NAME = 'e2e-dummy-bucket';
  process.env.R2_PUBLIC_URL = 'https://e2e-dummy.example.com';

  // Telegram -- WAJIB diisi untuk lolos validasi Joi yang sama, dengan
  // alasan yang SAMA seperti R2 di atas (dummy value, bukan real
  // credential). BEDA dengan R2: AuthService.register() (yang DIPANGGIL
  // beneran oleh test di auth.e2e-spec.ts) memang memanggil
  // TelegramService.notifyAdmin() -- tapi provider ini di-override jadi
  // mock di createTestApp() (lihat komentar di sana), jadi walau
  // env-nya cuma dummy, tidak akan ada HTTP call sungguhan ke
  // api.telegram.org selama E2E run. Nilai di sini murni untuk lolos
  // validasi Joi saat boot, bukan untuk benar-benar dipakai.
  process.env.TELEGRAM_BOT_TOKEN = 'e2e-dummy-bot-token';
  process.env.TELEGRAM_ADMIN_CHAT_ID = 'e2e-dummy-chat-id';

  // Redis SENGAJA TIDAK di-container-kan untuk E2E -- lihat komentar
  // filosofi di RedisModule (cache-aside, bukan source of truth).
  // REDIS_HOST tetap default 'localhost' dari env.validation.ts, yang di
  // lingkungan test/CI kemungkinan besar tidak ada Redis listening --
  // ioredis akan gagal connect cepat (maxRetriesPerRequest: 1,
  // enableOfflineQueue: false) dan kode pemanggil fallback ke query DB
  // langsung. Ini MEMVALIDASI SEKALIGUS bahwa fallback tsb benar-benar
  // jalan, bukan cuma asumsi.

  // Kurangi noise output test & overhead startup -- tidak perlu regenerasi
  // dokumentasi Swagger tiap run E2E.
  process.env.ENABLE_SWAGGER = 'false';
  process.env.LOG_LEVEL = 'error';
  // WAJIB false, bukan cuma pengurang noise: pino-pretty jalan lewat
  // worker_thread Node (pino.transport()) yang TIDAK otomatis berhenti
  // saat app.close() -- cuma berhenti kalau proses Node benar-benar
  // exit. Tiap app instance E2E (satu per file *.e2e-spec.ts) spawn
  // worker thread-nya sendiri; begitu ada >1 file test, sisa worker
  // thread ini yang bikin Jest tidak exit bersih ("Jest did not exit
  // one second after..."). JSON plain (tanpa transport) tidak spawn
  // worker thread sama sekali.
  process.env.LOG_PRETTY = 'false';

  // Migration dijalankan SEKALI di sini (bukan di dalam tiap test file)
  // supaya semua test file yang share container yang sama tidak lomba
  // migrate barengan.
  const migrationPool = new Pool({ connectionString: connectionUri });
  try {
    const db = drizzle(migrationPool);
    await migrate(db, {
      migrationsFolder: path.join(__dirname, '../../src/database/migrations'),
    });
  } finally {
    await migrationPool.end();
  }
}
