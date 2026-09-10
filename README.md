# Backend Auth + RBAC — NestJS 11 + Drizzle + Svelte

Project latihan backend fundamentals: auth (JWT + refresh rotation),
RBAC (role/permission), file upload + kompresi, clean architecture,
repository pattern, dan standard API response.

## Tech Stack

- **Backend**: NestJS 11 + TypeScript
- **ORM**: Drizzle ORM (PostgreSQL)
- **Auth**: JWT (access token) + refresh token via httpOnly cookie, rotasi & revoke
- **API Docs**: Swagger/OpenAPI (`@nestjs/swagger`) di `/api/docs`
- **Logging**: `nestjs-pino` (JSON terstruktur di production, pretty-print di development)
- **Health Check**: `@nestjs/terminus` di `/api/health` (custom indicator untuk Drizzle)
- **Audit Log**: tabel `audit_logs` sendiri (bukan cuma application log) — mencatat event bisnis penting (login, CRUD role/permission, avatar), queryable lewat `GET /audit-logs`
- **Frontend**: Svelte (simulasi UI untuk testing fitur backend)

## Cara Menjalankan (Development)

1. **Copy env**

   ```bash
   cp .env.example .env
   ```

2. **Jalankan PostgreSQL via Docker Compose**

   ```bash
   docker compose up -d
   ```

3. **Install dependencies**

   ```bash
   npm install
   ```

4. **Jalankan migration**

   ```bash
   npm run db:migrate
   ```

5. **Jalankan server**

   ```bash
   npm run start:dev
   ```

   Server jalan di `http://localhost:3000/api`. Cek `GET /api/health` untuk
   memastikan semua beres.

## Dokumentasi API (Swagger)

Buka **`http://localhost:3000/api/docs`** untuk dokumentasi interaktif
seluruh endpoint.

Cara coba endpoint yang butuh login lewat Swagger UI:

1. Jalankan `POST /auth/register`, lalu `POST /auth/login` langsung dari
   Swagger UI.
2. Salin `accessToken` dari response `login`.
3. Klik tombol **Authorize** (kanan atas), tempel token (tanpa prefix
   `Bearer `), lalu **Authorize**.
4. Semua endpoint protected sekarang otomatis terkirim header
   `Authorization: Bearer <token>`.

Catatan: `refreshToken` sengaja **tidak pernah** muncul di body response
(hanya via httpOnly cookie), jadi endpoint `/auth/refresh` dan
`/auth/logout` yang bergantung pada cookie tersebut lebih gampang dites
lewat Postman/browser daripada Swagger UI.

Swagger otomatis **nonaktif** kalau `NODE_ENV=production`, kecuali
di-paksa aktif lewat `ENABLE_SWAGGER=true` di `.env` (lihat
`.env.example`) — misalnya kalau kamu memang ingin memamerkannya sebagai
bagian dari portofolio publik.

## Quality Checks (Lint & Type Check)

Sebelum commit atau setelah menerapkan patch dari tiap tahap pengembangan,
jalankan ketiganya:

```bash
npm run typecheck   # tsc --noEmit — pastikan tidak ada error tipe
npm run lint         # ESLint (typescript-eslint recommendedTypeChecked)
npm run test         # unit test (menyusul di Phase 6)
```

Catatan penting: `typecheck`/`lint` hanya akurat SETELAH `npm install`
dijalankan ulang tiap kali ada dependency baru ditambahkan ke
`package.json`. Kalau belum, editor/ESLint akan menampilkan banyak error
palsu semacam `Unsafe call of a type that could not be resolved` — itu
bukan bug di kode, tapi karena TypeScript belum bisa membaca tipe dari
package yang belum ter-install (dianggap `any`, lalu ditangkap rule
`@typescript-eslint/no-unsafe-*`).

## Security Hardening

**Helmet** — menambah header keamanan HTTP standar (`X-Content-Type-Options`,
`X-Frame-Options`, `Strict-Transport-Security`, dst). Dua penyesuaian dari
default, keduanya karena app ini sengaja cross-origin (frontend terpisah,
avatar disajikan sebagai static file) — detail lengkap ada di komentar
`main.ts`:

- `contentSecurityPolicy` dimatikan HANYA saat Swagger aktif (CSP default
  akan bikin halaman `/api/docs` blank).
- `crossOriginResourcePolicy` di-set `cross-origin` supaya frontend di
  origin lain (mis. `localhost:5173`) bisa menampilkan `<img>` avatar dari
  `/uploads/...`.

**Rate limiting** (`@nestjs/throttler`) — dua lapis:

1. Global: `THROTTLE_LIMIT` request per `THROTTLE_TTL_MS` per IP (default
   100 req/menit), berlaku ke semua endpoint.
2. Lebih ketat khusus endpoint rawan brute-force/credential-stuffing:
   `POST /auth/register` & `POST /auth/login` (5/menit), `POST
/auth/refresh` (10/menit) — di-set langsung lewat `@Throttle()` di
   `auth.controller.ts` (lihat komentar di sana kenapa ini tidak lewat
   env seperti limit global).

Rate limiting sudah otomatis diaplikasikan sebagai guard GLOBAL
(`ThrottlerGuard` via `APP_GUARD` di `app.module.ts`), didaftarkan
PALING AWAL — sebelum `JwtAuthGuard`/`PermissionsGuard` — supaya request
yang bakal ditolak rate limiter tidak perlu ikut memproses autentikasi
yang lebih mahal.

`GET /health` sengaja dikecualikan (`@SkipThrottle()`) karena wajar
di-ping sangat sering oleh uptime monitor/load balancer.

**Cookie flags** (refresh token) — sudah benar sejak awal implementasi
(lihat `RefreshCookieHelper`): `httpOnly` (tidak bisa diakses JS di
browser), `secure` (wajib HTTPS) otomatis aktif kalau `NODE_ENV=production`,
`sameSite: 'lax'`, dan `path` dibatasi ke `/api/auth` saja.

## Logging

Semua log aplikasi (termasuk log otomatis tiap request/response) pakai
[`nestjs-pino`](https://github.com/iamolegga/nestjs-pino) — JSON
terstruktur, bukan `console.log` biasa.

- **Development**: pretty-print berwarna (`pino-pretty`), gampang dibaca
  di terminal.
- **Production**: JSON mentah ke stdout — jauh lebih murah diproses log
  aggregator (Loki/ELK/Datadog dst) dibanding parsing teks berwarna.
- Kontrol lewat env `LOG_LEVEL` (`trace`/`debug`/`info`/`warn`/`error`/
  `fatal`) dan `LOG_PRETTY` — keduanya opsional, default mengikuti
  `NODE_ENV` (lihat `configuration.ts`).
- **Redaksi otomatis**: header `Authorization`, `Cookie`, dan
  `Set-Cookie` SELALU disensor di log (`**REDACTED**`) — tidak pernah
  tercatat utuh, karena isinya JWT access token & refresh token.
- Level log tiap request otomatis mengikuti status HTTP: 5xx → `error`,
  4xx → `warn`, selebihnya → `info` — supaya gampang di-filter, tidak
  semua request "tenggelam" di level `info` yang sama.
- `GET /health` dikecualikan dari log otomatis (terlalu sering dipanggil
  uptime monitor, cuma jadi noise).

Migrasi ke pino ini **tidak mengubah kode di file lain manapun** —
`new Logger(NamaClass)` dari `@nestjs/common` yang sudah dipakai di
`AvatarStorageService`, `RefreshTokensService`, dst tetap berfungsi
persis sama, cuma outputnya sekarang lewat pino
(`app.useLogger(app.get(Logger))` di `main.ts` yang menangani switch ini
secara transparan).

## Health Check

`GET /health` (`GET /api/health` dengan prefix) sekarang berbasis
[`@nestjs/terminus`](https://github.com/nestjs/terminus), bukan sekadar
"aplikasi hidup, kembalikan 200":

- Cek koneksi Postgres via custom `DrizzleHealthIndicator`
  (`src/modules/health/indicators/database.health.ts`) — Terminus punya
  indicator bawaan untuk TypeORM/Mongoose/Prisma/dll, tapi TIDAK untuk
  Drizzle, jadi ditulis sendiri mengikuti API resmi
  `HealthIndicatorService` (bukan `HealthIndicator` lama yang sudah
  deprecated).
- Response sukses (200): `{ status: 'ok', info: { database: { status: 'up' } }, ... }`
- Response gagal (503, otomatis dari Terminus): detail indicator mana
  yang down beserta pesan error-nya — **tidak hilang** walau tetap
  dibungkus `ApiSuccessResponse`/`ApiErrorResponse` envelope standar
  aplikasi ini (lihat perbaikan di `AllExceptionsFilter` di bawah).
- `@Public()`, `@SkipThrottle()`, `@ApiExcludeController()` tetap
  dipertahankan seperti sebelumnya.

**Bug dorman yang ditemukan & dibenahi saat mengerjakan ini:**

1. `DatabaseModule.onModuleDestroy()` sudah ada sejak awal tapi **tidak
   pernah benar-benar terpanggil** — NestJS tidak menjalankan lifecycle
   shutdown hook saat menerima SIGTERM/SIGINT kecuali
   `app.enableShutdownHooks()` diaktifkan eksplisit, dan itu baru
   dilakukan sekarang. Pool Postgres direstrukturisasi (token `PG_POOL`
   terpisah, tidak di-export ke modul lain) supaya bisa benar-benar
   ditutup graceful saat shutdown.
2. `AllExceptionsFilter` diam-diam membuang detail error kalau body
   exception bukan bentuk `{ message: string }` standar NestJS — persis
   kasus `HealthCheckResult` dari Terminus saat gagal (`{status, info,
error, details}`, tanpa field `message` sama sekali). Sekarang body
   apa adanya di-fallback ke `errors` supaya detail tidak hilang.

## Audit Log

Beda dari **Logging** (`nestjs-pino`, di atas) yang mencatat _setiap
request HTTP_ untuk kebutuhan operasional (debugging, monitoring) dan
disimpan sebagai log file/stdout — **Audit Log** mencatat _event bisnis
tertentu yang bermakna_ (siapa melakukan apa, ke resource mana, kapan)
secara permanen di tabel `audit_logs`, untuk kebutuhan forensik &
kepatuhan. Dua hal ini sengaja dipisah, bukan duplikat.

**Event yang tercatat saat ini:**

| Action                                    | Actor                        | Catatan                                                                                                                                                                     |
| ----------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.register`                           | User baru                    |                                                                                                                                                                             |
| `auth.login_success`                      | User yang login              |                                                                                                                                                                             |
| `auth.login_failed`                       | User (kalau ketemu) / `null` | `metadata.reason`: `user_not_found` \| `account_inactive` \| `invalid_password`. Email yang **dicoba** tetap dicatat walau usernya tidak ada — berguna deteksi brute-force. |
| `auth.logout` / `auth.logout_all`         | User yang logout             |                                                                                                                                                                             |
| `role.create` / `update` / `delete`       | Admin pelaku                 | `role.delete` menyimpan nama role di metadata SEBELUM baris DB-nya hilang                                                                                                   |
| `role.assign_user` / `revoke_user`        | Admin pelaku                 | resourceId gabungan `"roleId:userId"`                                                                                                                                       |
| `role.sync_permissions`                   | Admin pelaku                 | metadata: daftar permissionId baru                                                                                                                                          |
| `permission.create` / `update` / `delete` | Admin pelaku                 |                                                                                                                                                                             |
| `profile.avatar_update` / `avatar_reset`  | User itu sendiri             | Selalu self-service, tidak ada actor terpisah                                                                                                                               |

**Desain penting:**

- `AuditLogService.record()` **best-effort** — kalau penulisan log gagal
  (mis. DB sesaat bermasalah), itu TIDAK BOLEH menggagalkan operasi
  bisnis yang sudah sukses. Error-nya cuma di-log lewat pino, tidak
  pernah di-`throw` ulang ke pemanggil.
- `action` disimpan sebagai `varchar` bebas (bukan enum Postgres) supaya
  menambah jenis event baru tidak perlu migration `ALTER TYPE` — tapi di
  sisi aplikasi tetap type-safe lewat union string literal `AuditAction`
  (typo ketahuan saat compile).
- `actorEmail` disimpan sebagai **snapshot**, terpisah dari relasi
  `actorUserId` — kalau user-nya nanti dihapus atau ganti email, baris
  audit lama tetap terbaca "siapa" pelakunya. `actorUserId` sendiri
  `onDelete: 'set null'` (bukan `cascade`) dengan alasan yang sama:
  riwayat audit harus tetap ada walau user-nya dihapus.
- Dua "jenis" actor yang berbeda konsep: di event **auth**, actor =
  subjek event itu sendiri (`AuthService` langsung tahu `user.id`). Di
  **CRUD role/permission**, actor = **admin yang melakukan** aksi
  terhadap resource lain, jadi harus di-thread eksplisit dari
  `@CurrentUser()` di controller sampai ke service (lihat parameter
  `actor: AuditActor` di `RolesService`/`PermissionsService`).

**Endpoint admin:** `GET /audit-logs` (butuh permission `audit-log:read`
— buat & assign permission ini seperti biasa lewat `POST /permissions`

- `PUT /roles/:id/permissions`). Filter: `actorUserId`, `action` (exact
  match), `resourceType`. Sort cuma `createdAt` (audit log dibaca
  kronologis, beda dari resource lain yang wajar di-sort per nama).

## Script Database (Drizzle Kit)

| Script                | Fungsi                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run db:generate` | Generate file migration SQL baru dari perubahan schema                                           |
| `npm run db:migrate`  | Terapkan migration yang belum berjalan ke database                                               |
| `npm run db:push`     | Push schema langsung ke DB tanpa file migration (khusus prototyping cepat, hindari di kerja tim) |
| `npm run db:studio`   | Buka Drizzle Studio (GUI browser untuk lihat isi database)                                       |

## Arsitektur

```
src/
  common/          # Cross-cutting concern lintas modul
    decorators/    # @ResponseMessage, dst
    filters/       # AllExceptionsFilter (format error konsisten)
    interceptors/  # ResponseInterceptor (format response konsisten)
    interfaces/     # Kontrak tipe bersama (ApiResponse, PaginatedResult)
    swagger/        # Model & decorator dokumentasi (ApiStandardResponse)
  config/          # Konfigurasi terpusat + validasi env (fail-fast) + setup Swagger/logger
  core/
    repositories/  # BaseRepository — DI wiring dasar untuk semua repository
  database/
    schema/        # Definisi tabel Drizzle (source of truth struktur DB)
    migrations/    # File migration SQL yang di-generate dari schema
    database.module.ts  # Provider koneksi Postgres (PG_POOL) + instance Drizzle (global)
  modules/         # Feature module: auth, users, profiles, roles, permissions, health, audit-log
```

### Kenapa strukturnya begini?

- **`common/` vs `core/`**: `common` isinya hal generik lintas layer (HTTP
  interceptor, filter, decorator) yang menyentuh request/response.
  `core` isinya abstraksi domain-agnostic yang dipakai business logic
  (mis. base repository). Pemisahan ini bikin jelas mana yang "infrastruktur
  HTTP" vs "infrastruktur domain".
- **Repository pattern tidak generic-CRUD**: `BaseRepository` sengaja
  minimal (cuma DI wiring). Tiap repository konkret (`UsersRepository`,
  dst — menyusul di Phase 1) menulis query method sendiri yang eksplisit
  dan type-safe, karena tiap tabel punya aturan bisnis query berbeda
  (mis. `users` selalu exclude soft-deleted row). DRY dicapai lewat
  shared query helper (pagination/filter/sort), bukan lewat generic CRUD
  class yang memaksakan satu bentuk untuk semua tabel.
- **Standard response**: setiap response sukses otomatis dibungkus
  `ResponseInterceptor` jadi `{ success, statusCode, message, data, meta?, timestamp, path }`.
  Setiap error (baik `HttpException` maupun error tak terduga) ditangkap
  `AllExceptionsFilter` dan dibentuk konsisten `{ success:false, statusCode, message, errors?, timestamp, path }`.
  Controller tidak perlu tahu soal ini — cukup `return data;` atau
  `throw new BadRequestException(...)`.
- **Auth: secure by default**: `JwtAuthGuard` didaftarkan sebagai
  `APP_GUARD` (global), jadi SEMUA route protected secara default.
  Endpoint yang memang harus publik (register, login, health check)
  ditandai eksplisit dengan `@Public()`. Ini mencegah developer lupa
  pasang guard di endpoint baru.
- **Transaction untuk data yang saling bergantung**: registrasi user
  insert ke tabel `users` DAN `profiles` dalam satu `db.transaction()`
  karena `profiles.user_id` NOT NULL UNIQUE — user tanpa profile adalah
  state tidak valid, jadi kalau salah satu insert gagal, keduanya rollback.
- **Anti user-enumeration**: pesan error login untuk "email tidak
  terdaftar" dan "password salah" dibuat SAMA persis, supaya attacker
  tidak bisa menyimpulkan email mana yang valid dari respons API.
- **Refresh token = opaque random string, bukan JWT**: di-generate
  `crypto.randomBytes(64)`, disimpan ke DB sebagai SHA-256 hash (beda
  dari password yang pakai argon2 — alasannya didokumentasikan di
  `modules/auth/utils/hash-token.util.ts`). Access token tetap JWT
  seperti biasa (stateless, short-lived).
- **Refresh token HANYA lewat httpOnly cookie**, tidak pernah muncul
  di body JSON — supaya tidak bisa dicuri lewat XSS/JS di sisi client.
- **Rotasi + reuse detection**: setiap `/auth/refresh` langsung
  me-revoke token lama dan menerbitkan yang baru (kolom `replaced_by_id`
  di ERD dipakai persis untuk ini). Kalau ada yang mencoba memakai
  token yang SUDAH di-revoke (baik karena sudah dirotasi ATAU sudah
  logout), sistem menganggap itu sinyal token dicuri dan langsung
  me-revoke SEMUA sesi user tersebut — mendorong re-login penuh di
  semua device. Trade-off ini disengaja (mirip pendekatan Auth0/AWS
  Cognito): sekali sebuah refresh token "dipakai ulang" setelah tidak
  valid, seluruh session family dianggap tidak bisa dipercaya lagi.
- **Permission dicek LIVE dari database**, bukan di-embed ke JWT
  payload (`AuthorizationService.getUserPermissionNames()` query join
  `user_roles -> role_permissions -> permissions` di setiap request
  yang butuh `@RequirePermission()`). Konsekuensinya: assign/revoke
  role ke user langsung berlaku di request berikutnya, TANPA user
  perlu logout/refresh token dulu — sudah diverifikasi langsung lewat
  testing manual (lihat catatan bug guard-order di bawah).
- **`role_permissions` dan `user_roles` punya unique constraint**
  komposit (`role_id + permission_id` dan `user_id + role_id`) — dasar
  awalnya (Phase 0) belum ada, ditambahkan di Phase 3 supaya assign
  yang sama dua kali tidak menghasilkan baris duplikat di database.
- **Seed script untuk bootstrap RBAC**: karena SEMUA endpoint role/
  permission dilindungi `@RequirePermission`, harus ada cara membuat
  role/permission pertama tanpa lewat API (chicken-and-egg problem).
  `npm run db:seed` membuat baseline permission + role `superadmin`,
  dan bisa meng-assign-nya ke user tertentu lewat env `SEED_ADMIN_EMAIL`.
- **Avatar diproses di memory, ditulis ke disk sekali**: upload avatar
  pakai `multer` dengan `memoryStorage()` (bukan simpan file mentah ke
  disk dulu) — buffer langsung diproses `sharp` (resize 512×512 +
  convert ke WebP kualitas 80) baru ditulis final ke disk. Hasilnya:
  kompresi signifikan (contoh nyata saat testing: JPEG 8.7KB jadi
  WebP 554 byte, ~94% lebih kecil) dan format seragam apapun input-nya
  (JPEG/PNG/WebP).
- **File avatar lama otomatis dihapus** setiap kali avatar diganti
  atau direset ke default — mencegah file sampah menumpuk di disk.
  Default avatar sendiri TIDAK PERNAH ikut terhapus (dicek eksplisit
  lewat pencocokan URL di `AvatarStorageService.deleteIfCustom()`).
- **Default avatar dibundel sebagai asset**, bukan cuma string path di
  DB — `nest-cli.json` dikonfigurasi untuk ikut meng-copy
  `default-avatar.png` ke `dist/` saat build, lalu `AvatarStorageService`
  meng-copy-nya ke folder `uploads/avatars/` saat aplikasi start
  (kalau belum ada). Jadi endpoint `/uploads/avatars/default.png`
  selalu bisa diakses sejak first boot, tanpa perlu upload manual.
- **`profile:read`/`profile:update` sebagai contoh integrasi RBAC lintas
  modul**: endpoint admin `GET/PATCH /profiles/:userId` dilindungi
  `@RequirePermission`, membuktikan pola yang sama dari Phase 3 bisa
  dipakai ulang di modul manapun tanpa perubahan pada
  `AuthorizationModule`/`PermissionsGuard`.
- **Swagger mendokumentasikan response ASLI, bukan DTO mentah**:
  `ResponseInterceptor` membungkus semua response sukses jadi
  `{ success, statusCode, message, data, meta?, timestamp, path }`.
  Kalau Swagger cuma diberi tahu tipe `data`-nya, dokumentasi jadi
  menyesatkan. Solusinya: decorator `ApiStandardResponse(dto, opts)` di
  `common/swagger/` membungkus schema `dto` di dalam model
  `ApiSuccessEnvelope` lewat `allOf` + `getSchemaPath` (pola resmi
  NestJS untuk generic response di Swagger), dengan opsi `isArray`/
  `paginated` untuk endpoint list.
- **Pagination/search/sort/filter TANPA generic query builder**: sama
  seperti filosofi `BaseRepository`, tidak ada satu "list engine" ajaib
  yang tahu segalanya. DRY dicapai di 2 titik kecil: (1) `PaginationQueryDto`
  yang di-extend tiap resource (`FindUsersQueryDto`, `FindRolesQueryDto`,
  dst) untuk `page`/`limit`, ditambah field `search`/`sortBy`/`sortOrder`/
  filter miliknya sendiri; (2) helper `paginate()` yang menyeragamkan
  pola "jalankan query count & data secara paralel, bentuk objek `meta`".
  Tiap repository TETAP menulis `where`/`orderBy` sendiri secara eksplisit
  dan type-safe. `sortBy` divalidasi lewat whitelist (`@IsIn([...])`),
  BUKAN menerima nama kolom bebas dari client — mencegah client
  mengintip/mengeksploitasi nama kolom internal yang tidak dimaksudkan
  untuk publik.
- **`PaginatedResult<T>` terhubung otomatis ke response envelope**:
  `ResponseInterceptor` (dibuat sejak Phase 0!) sudah mendeteksi shape
  `{ items, meta }` dan membongkarnya jadi `data` + `meta` di level atas
  response — controller yang pakai `paginate()` tidak perlu tahu/berubah
  sama sekali soal pembentukan response, cukup `return` hasil repository
  apa adanya.

## Bug Nyata yang Ditemukan Saat Testing: MIME Type Spoofing pada Upload Avatar

Saat testing manual Phase 4, upload file `.ts` yang di-rename ekstensinya
jadi `.jpg` menghasilkan `500 Internal Server Error` (dengan stack trace
`sharp` bocor ke response), bukan `415` seperti upload file jenis lain
yang jelas-jelas salah (mis. PDF).

**Root cause**: `file.mimetype` yang dibaca `multer` berasal dari header
`Content-Type` yang **diklaim client** di request multipart — BUKAN
dideteksi dari isi file. Client (browser/curl/script) bebas mengklaim
`Content-Type: image/jpeg` untuk file apapun, termasuk source code yang
sekadar di-rename ekstensinya. Validasi awal (`ALLOWED_MIME_TYPES.includes(mimetype)`)
lolos karena klaim-nya "benar", padahal isinya bukan gambar — lalu
`sharp` gagal decode buffer tersebut dan melempar `Error` biasa (bukan
`HttpException`), yang jatuh ke fallback 500 di `AllExceptionsFilter`.

**Prinsip yang dilanggar**: jangan pernah percaya `Content-Type`/MIME
type yang diklaim client untuk keputusan validasi keamanan — itu input
yang sepenuhnya dikontrol attacker. Validasi yang benar harus membaca
**isi file sesungguhnya**.

**Fix** di `AvatarStorageService.saveAvatar()`:

1. Cek `mimetype` klaim client tetap dipertahankan sebagai fast-fail
   murah (menolak kesalahan jujur lebih awal dengan pesan jelas).
2. Ditambah verifikasi SESUNGGUHNYA: `sharp(buffer).metadata()` membaca
   magic bytes file dan melaporkan format asli yang terdeteksi dari
   isinya. Kalau tidak bisa dibaca sama sekali, atau formatnya di luar
   allow-list (`jpeg`/`png`/`webp`), request ditolak `415` — walau
   client mengklaim Content-Type yang "benar".
3. Proses kompresi (`resize`+`webp`) juga dibungkus try/catch terpisah
   sebagai defense-in-depth, untuk kasus file corrupt yang lolos
   `metadata()` tapi gagal di decode penuh.

Hasilnya: SEMUA jalur kegagalan dari `sharp` sekarang dipetakan ke
`UnsupportedMediaTypeException` (415, kesalahan client) alih-alih
bocor sebagai 500 (yang seharusnya berarti "bug internal server").

## Bug Nyata yang Ditemukan Saat Testing: Urutan APP_GUARD

Saat testing manual Phase 3, endpoint yang di-protect `@RequirePermission`
SELALU menolak dengan "User tidak terautentikasi" — walau token JWT-nya
valid. Root cause: ada DUA provider `APP_GUARD` global (`JwtAuthGuard` di
`AuthModule`, `PermissionsGuard` di `AuthorizationModule`), dan NestJS
menjalankan beberapa `APP_GUARD` sesuai **urutan modul di-resolve**
(kurang lebih mengikuti urutan `imports` di `AppModule`). Karena saat
itu `AuthorizationModule` di-import SEBELUM `AuthModule`, `PermissionsGuard`
jalan duluan dan membaca `request.user` yang belum di-set oleh
`JwtAuthGuard`.

Fix-nya cuma menukar urutan `imports` di `app.module.ts` (`AuthModule`
sebelum `AuthorizationModule`) — tapi ini pelajaran penting: **urutan
provider `APP_GUARD` di berbagai modul itu signifikan** kalau satu
guard bergantung pada state yang diisi guard lain. Kalau nanti nambah
guard global baru yang butuh `request.user`, pastikan modul yang
provide `JwtAuthGuard` (`AuthModule`) tetap di-import lebih dulu.

## Catatan Teknis: ESM-only dependencies + Jest

Beberapa package terbaru (`@nestjs/config`, `@nestjs/jwt`,
`@nestjs/passport`, `@nestjs/mapped-types`, `drizzle-orm`,
`@standard-schema/spec`) sudah ship sebagai **pure ESM**
(`"type": "module"` di package.json mereka), sementara project ini
jalan dalam mode CommonJS. Aplikasi utama (`node dist/src/main.js`)
tidak masalah, tapi **Jest** menolak me-`require()` file ESM tersebut
secara default.

Percobaan pertama (`transformIgnorePatterns` + `ts-jest` polos) berhasil
untuk sebagian besar package, tapi gagal khusus untuk
`@nestjs/mapped-types` karena file itu memakai sintaks `import.meta.url`
yang butuh compiler khusus untuk dikonversi ke CommonJS — `ts-jest`
punya keterbatasan resmi soal transform file `.js` di dalam
`node_modules`. Solusi akhir yang dipakai project ini: **`@swc/jest`**
(compiler Rust berbasis SWC, sama yang dipakai `@nestjs/cli` untuk
build cepat) — jauh lebih robust untuk interop ESM/CJS termasuk kasus
`import.meta.url`. Konfigurasinya ada di `package.json` (key `"jest"`)
dan `test/jest-e2e.json`, keduanya pakai `transform` + `transformIgnorePatterns`
yang sama.

Kalau nanti nambah dependency baru dan Jest tiba-tiba error
`"Must use import to load ES Module"`, kemungkinan besar dependency
itu juga ESM-only — tinggal tambahkan namanya ke pattern
`transformIgnorePatterns` di KEDUA file config (`package.json` dan
`test/jest-e2e.json`).

## API Endpoints (Phase 1 + 2)

| Method | Endpoint               | Auth?     | Deskripsi                                                                      |
| ------ | ---------------------- | --------- | ------------------------------------------------------------------------------ |
| GET    | `/api/health`          | Public    | Health check                                                                   |
| POST   | `/api/auth/register`   | Public    | Registrasi user baru + auto-create profile                                     |
| POST   | `/api/auth/login`      | Public    | Login → `accessToken` di body, `refresh_token` di httpOnly cookie              |
| POST   | `/api/auth/refresh`    | Public*   | Tukar refresh token (cookie) dengan access token + refresh token baru (rotasi) |
| POST   | `/api/auth/logout`     | Public*   | Revoke sesi saat ini (device ini saja)                                         |
| POST   | `/api/auth/logout-all` | Protected | Revoke SEMUA sesi milik user (butuh access token)                              |
| GET    | `/api/auth/me`         | Protected | Data user yang sedang login                                                    |

\* `refresh` dan `logout` tidak butuh `Authorization` header (bukan
dilindungi JWT guard), tapi tetap butuh refresh token cookie yang valid
untuk berfungsi — beda mekanisme autentikasi, bukan berarti "tanpa
autentikasi sama sekali".

Contoh:

```bash
# Login — simpan cookie ke jar (butuh -c saat login, -b saat request selanjutnya)
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"budi@example.com","password":"password123"}'

# Refresh (pakai cookie yang tersimpan)
curl -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/auth/refresh

# Logout
curl -b cookies.txt -X POST http://localhost:3000/api/auth/logout

# Logout semua device (butuh access token dari login/refresh terakhir)
curl -X POST http://localhost:3000/api/auth/logout-all \
  -H "Authorization: Bearer <accessToken>"
```

Kalau test dari Postman/Insomnia/frontend browser: pastikan opsi
"send cookies automatically" / `credentials: 'include'` aktif, karena
refresh token cookie di-scope ke path `/api/auth` dan `httpOnly`
(tidak bisa dibaca/di-attach manual lewat JS).

## API Endpoints (Phase 3 — RBAC)

Semua endpoint di bawah ini butuh `Authorization: Bearer <accessToken>`
**DAN** permission yang sesuai (bukan cuma login biasa).

### Permissions

| Method | Endpoint               | Permission          | Deskripsi               |
| ------ | ---------------------- | ------------------- | ----------------------- |
| GET    | `/api/permissions`     | `permission:read`   | Daftar semua permission |
| GET    | `/api/permissions/:id` | `permission:read`   | Detail satu permission  |
| POST   | `/api/permissions`     | `permission:create` | Buat permission baru    |
| PATCH  | `/api/permissions/:id` | `permission:update` | Ubah permission         |
| DELETE | `/api/permissions/:id` | `permission:delete` | Hapus permission        |

### Roles

| Method | Endpoint                       | Permission                | Deskripsi                                                              |
| ------ | ------------------------------ | ------------------------- | ---------------------------------------------------------------------- |
| GET    | `/api/roles`                   | `role:read`               | Daftar semua role                                                      |
| GET    | `/api/roles/:id`               | `role:read`               | Detail satu role                                                       |
| POST   | `/api/roles`                   | `role:create`             | Buat role baru                                                         |
| PATCH  | `/api/roles/:id`               | `role:update`             | Ubah role (nama/deskripsi)                                             |
| DELETE | `/api/roles/:id`               | `role:delete`             | Hapus role (cascade ke assignment-nya)                                 |
| GET    | `/api/roles/:id/permissions`   | `role:read`               | Daftar permission milik role ini                                       |
| PUT    | `/api/roles/:id/permissions`   | `role:manage-permissions` | Ganti SELURUH daftar permission role ini (`{"permissionIds":[1,2,3]}`) |
| GET    | `/api/roles/:id/users`         | `role:read`               | Daftar user pemilik role ini                                           |
| POST   | `/api/roles/:id/users/:userId` | `role:manage-users`       | Assign role ke user                                                    |
| DELETE | `/api/roles/:id/users/:userId` | `role:manage-users`       | Cabut role dari user                                                   |

### Bootstrap RBAC (wajib dilakukan sekali di awal)

```bash
# 1. Register user yang akan jadi admin pertama
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123","fullName":"Admin"}'

# 2. Set di .env:
#    SEED_ADMIN_EMAIL=admin@example.com

# 3. Jalankan seed — bikin baseline permission + role superadmin,
#    lalu assign ke admin@example.com
npm run db:seed

# 4. Login sebagai admin, sekarang bisa akses semua endpoint role/permission
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}'
```

Contoh alur assign role custom ke user lain:

```bash
# Buat role baru
curl -X POST http://localhost:3000/api/roles \
  -H "Authorization: Bearer <accessToken admin>" -H "Content-Type: application/json" \
  -d '{"name":"editor","description":"Bisa lihat role & permission"}'

# Assign permission ke role itu (ganti 5 dengan id role, [12] dengan id permission)
curl -X PUT http://localhost:3000/api/roles/5/permissions \
  -H "Authorization: Bearer <accessToken admin>" -H "Content-Type: application/json" \
  -d '{"permissionIds":[12]}'

# Assign role ke user (ganti 5 dengan id role, 7 dengan id user)
curl -X POST http://localhost:3000/api/roles/5/users/7 \
  -H "Authorization: Bearer <accessToken admin>"
```

User yang di-assign akan LANGSUNG bisa akses endpoint terkait di
request berikutnya — tidak perlu logout/login ulang, karena permission
dicek live dari database (lihat penjelasan di bagian "Kenapa
strukturnya begini?").

## API Endpoints (Phase 4 — Profile)

### Self-service (semua user login, tanpa permission khusus)

| Method | Endpoint                 | Deskripsi                                     |
| ------ | ------------------------ | --------------------------------------------- |
| GET    | `/api/profile/me`        | Lihat profile milik sendiri                   |
| PATCH  | `/api/profile/me`        | Update `fullName`/`phone`/`bio` milik sendiri |
| POST   | `/api/profile/me/avatar` | Upload avatar (multipart, field `avatar`)     |
| DELETE | `/api/profile/me/avatar` | Reset avatar ke default                       |

### Admin (butuh permission)

| Method | Endpoint                | Permission       | Deskripsi                                |
| ------ | ----------------------- | ---------------- | ---------------------------------------- |
| GET    | `/api/profiles/:userId` | `profile:read`   | Lihat profile user manapun               |
| PATCH  | `/api/profiles/:userId` | `profile:update` | Ubah profile user manapun (tanpa avatar) |

Batasan upload: maksimal 5MB, format JPEG/PNG/WebP saja (ditolak `415`
kalau format lain). Hasil akhir SELALU WebP 512×512 apapun format/ukuran
aslinya.

Contoh:

```bash
# Lihat profile sendiri
curl http://localhost:3000/api/profile/me -H "Authorization: Bearer <accessToken>"

# Update field profile
curl -X PATCH http://localhost:3000/api/profile/me \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"fullName":"Budi Santoso","phone":"081234567890","bio":"Backend developer"}'

# Upload avatar
curl -X POST http://localhost:3000/api/profile/me/avatar \
  -H "Authorization: Bearer <accessToken>" \
  -F "avatar=@/path/ke/foto.jpg;type=image/jpeg"

# Reset avatar ke default
curl -X DELETE http://localhost:3000/api/profile/me/avatar \
  -H "Authorization: Bearer <accessToken>"

# Akses gambar avatar langsung (URL didapat dari response di atas)
curl http://localhost:3000/uploads/avatars/user-3-xxxx.webp -o avatar.webp
```

## API Endpoints (Phase 5 — List Features)

Semua endpoint list (`GET /users`, `GET /roles`, `GET /permissions`)
menerima query parameter berikut:

| Param       | Tipe                     | Default           | Keterangan                                   |
| ----------- | ------------------------ | ----------------- | -------------------------------------------- |
| `page`      | integer (≥1)             | `1`               | Halaman ke berapa                            |
| `limit`     | integer (1–100)          | `10`              | Jumlah item per halaman (dibatasi maks. 100) |
| `search`    | string                   | -                 | Pencarian bebas (`ILIKE`, case-insensitive)  |
| `sortBy`    | enum (beda per resource) | beda per resource | Kolom sort — divalidasi lewat whitelist      |
| `sortOrder` | `asc` \| `desc`          | beda per resource | Arah sort                                    |

Kolom yang bisa di-`search`/`sortBy` per resource:

| Resource       | `search` mencocokkan  | `sortBy` yang diizinkan |
| -------------- | --------------------- | ----------------------- |
| `/users`       | `email`               | `email`, `createdAt`    |
| `/roles`       | `name`, `description` | `name`, `createdAt`     |
| `/permissions` | `name`, `description` | `name`, `createdAt`     |

`GET /users` juga menerima filter tambahan `isActive=true|false`.

Response list SELALU membawa `meta` di level atas:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Daftar user berhasil diambil",
  "data": [/* array item */],
  "meta": { "page": 1, "limit": 10, "totalItems": 42, "totalPages": 5 },
  "timestamp": "...",
  "path": "/api/users"
}
```

Contoh:

```bash
# Halaman 2, 20 item per halaman
curl "http://localhost:3000/api/users?page=2&limit=20" -H "Authorization: Bearer <accessToken>"

# Cari user dengan email mengandung "budi", urutkan berdasarkan email A-Z
curl "http://localhost:3000/api/users?search=budi&sortBy=email&sortOrder=asc" -H "Authorization: Bearer <accessToken>"

# Hanya user yang tidak aktif
curl "http://localhost:3000/api/users?isActive=false" -H "Authorization: Bearer <accessToken>"

# Cari role/permission
curl "http://localhost:3000/api/roles?search=admin" -H "Authorization: Bearer <accessToken>"
curl "http://localhost:3000/api/permissions?search=role" -H "Authorization: Bearer <accessToken>"
```

`GET /users` butuh permission `user:read` (sudah otomatis dimiliki
`superadmin` lewat seed script — jalankan ulang `npm run db:seed`
kalau superadmin kamu dibuat sebelum Phase 5 supaya permission baru
ini ikut ter-assign).

## API Endpoints (Phase 6 — Audit Log)

`GET /audit-logs` — beda dari endpoint list lain, TIDAK punya `search`
bebas, cuma filter exact-match:

| Param          | Tipe                                           | Keterangan                                     |
| -------------- | ---------------------------------------------- | ---------------------------------------------- |
| `actorUserId`  | integer                                        | Filter exact match berdasarkan id pelaku       |
| `action`       | string                                         | Filter exact match, contoh `auth.login_failed` |
| `resourceType` | string                                         | Filter exact match, contoh `role`              |
| `sortBy`       | `createdAt` (satu-satunya pilihan)             |                                                |
| `sortOrder`    | `asc` \| `desc`, default `desc` (terbaru dulu) |                                                |

`page`/`limit` sama seperti endpoint list lainnya.

Contoh:

```bash
# 20 audit log terbaru
curl "http://localhost:3000/api/audit-logs?limit=20" -H "Authorization: Bearer <accessToken>"

# Semua percobaan login gagal
curl "http://localhost:3000/api/audit-logs?action=auth.login_failed" -H "Authorization: Bearer <accessToken>"

# Semua aktivitas 1 user tertentu
curl "http://localhost:3000/api/audit-logs?actorUserId=7" -H "Authorization: Bearer <accessToken>"
```

Butuh permission `audit-log:read` — permission ini BARU, belum otomatis
ter-assign ke role manapun lewat seed script lama. Buat & assign manual:

```bash
curl -X POST http://localhost:3000/api/permissions \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"name":"audit-log:read","description":"Lihat audit log"}'
# lalu PUT /roles/:id/permissions untuk assign ke role superadmin
```

## Progress Roadmap

- [x] **Phase 0 — Fondasi & Arsitektur**
      Config + env validation, Drizzle setup (7 tabel sesuai ERD),
      Docker Compose Postgres, standard response wrapper, global
      exception filter, base repository pattern, clean folder structure.
- [x] **Phase 1 — Auth MVP**
      Register (+ auto create profile via transaction), login, JWT
      access token, global guard dengan `@Public()` opt-out,
      password hashing (argon2), validasi DTO, anti user-enumeration.
- [x] **Phase 2 — Refresh Token System**
      Refresh token opaque + hash SHA-256, httpOnly cookie, rotasi
      per-request, reuse detection (auto-revoke semua sesi kalau ada
      indikasi token dicuri), endpoint logout & logout-all.
- [x] **Phase 3 — RBAC**
      CRUD role & permission, sync permission ke role, assign/revoke
      role ke user, `@RequirePermission()` + `PermissionsGuard` global
      (cek permission live dari DB — efek langsung tanpa re-login),
      seed script untuk bootstrap role superadmin.
- [x] **Phase 4 — Profile Module**
      CRUD profile self-service + admin (integrasi RBAC), upload avatar
      dengan kompresi otomatis (resize 512×512 + convert WebP via
      sharp), cleanup file lama otomatis, default avatar dibundel &
      di-copy saat first boot, static file serving di `/uploads/*`.
- [x] **Phase 5 — List Features**
      Pagination + search + sort + filter reusable (`PaginationQueryDto` + helper `paginate()`) dipasang di `GET /users` (endpoint baru),
      `GET /roles`, `GET /permissions`. Whitelist kolom sort per
      resource, filter `isActive` khusus users, terhubung otomatis ke
      `meta` di response envelope lewat `PaginatedResult<T>`.
- [ ] **Phase 6 — Production-Readiness Extras**
      Scope tambahan di luar rencana awal, ditambahkan supaya project ini
      layak dijadikan portofolio & siap-deploy. Dikerjakan bertahap per
      sub-item (lihat checklist detail di bawah).
  - [x] Swagger/OpenAPI docs — **SELESAI**. Setup inti (`/api/docs`, bearer
        auth, `ApiStandardResponse`) + anotasi penuh semua modul (Auth,
        Users, Profiles, Roles, Permissions): `@ApiTags`, `@ApiOperation`,
        `@ApiParam`, dokumentasi error (`@ApiConflictResponse`,
        `@ApiForbiddenResponse`, `@ApiNotFoundResponse`,
        `@ApiUnauthorizedResponse`) sesuai exception yang benar-benar
        dilempar tiap service. Bonus: `UpdateRoleDto`/`UpdatePermissionDto`
        dipindah ke `PartialType` dari `@nestjs/swagger` (bukan
        `@nestjs/mapped-types`) supaya field opsional ikut terefleksi di
        dokumentasi OpenAPI, dependency lama dihapus.
  - [x] Security hardening — Helmet (header keamanan, CSP dimatikan khusus saat Swagger aktif, CORP `cross-origin` untuk avatar), rate limiting global via `@nestjs/throttler` + limit lebih ketat khusus di `/auth/register`, `/auth/login`, `/auth/refresh`. Cookie flags (httpOnly/secure/sameSite) sudah benar sejak awal (lihat `RefreshCookieHelper`).
  - [x] Structured logging (`nestjs-pino`) — JSON di production, pretty-print berwarna di development (`LOG_LEVEL`/`LOG_PRETTY`), redact otomatis header `Authorization`/`Cookie`/`Set-Cookie`, level log mengikuti status HTTP (4xx→warn, 5xx→error), health check dikecualikan dari auto-log biar tidak jadi noise.
  - [x] Centralized logging (Grafana Loki + Alloy + Grafana) —
        `docker compose up -d` sekarang juga menjalankan `loki`, `alloy`,
        `grafana` selain `postgres`/`redis`. Alloy tarik log SEMUA
        container milik project ini (difilter via label
        `com.docker.compose.project`, lihat `name: rbac-backend` di
        `docker-compose.yml`) lewat Docker socket, kirim ke Loki. Cuma
        field `level` yang dipromosikan jadi LABEL Loki (cardinality
        rendah, ~6 nilai tetap) — field lain (`reqId`, `userId`, `msg`)
        SENGAJA dibiarkan di isi log, dicari lewat `| json` saat query,
        bukan di-index permanen (index label ber-cardinality tinggi =
        "cardinality explosion", kesalahan umum pemula Loki).
        Grafana: **http://localhost:3300** (BUKAN 3000 — itu port host
        untuk app sendiri), login admin otomatis (anonymous auth,
        HANYA untuk dev lokal), datasource Loki sudah ter-provisioning
        otomatis (tidak perlu setup manual).

        **Kalau mau lihat log app KAMU SENDIRI di Grafana** (bukan
            cuma Postgres/Redis): app yang jalan host-mode
            (`npm run start:dev`) TIDAK terlihat Alloy sama sekali (Alloy
            cuma bisa lihat container Docker). Matikan dulu
            `npm run start:dev`, lalu:
            `docker compose --profile full up -d --build app` — ini
            menjalankan app di container dev (`Dockerfile.dev`, BUKAN
            Dockerfile production — itu roadmap terpisah) khusus untuk
            keperluan demo/verifikasi pipeline observability ini.

            Contoh query LogQL di Grafana Explore:
            `{container="rbac_app"} | json | level="error"` (semua error
            dari app).

  - [x] Health check proper (`@nestjs/terminus`) — `GET /api/health` sekarang benar-benar cek koneksi Postgres (custom `DrizzleHealthIndicator`, karena Terminus tidak punya indicator bawaan untuk Drizzle), balas 503 kalau DB down, bukan cuma "aplikasi hidup". Bonus: `app.enableShutdownHooks()` diaktifkan sekaligus membenahi bug dorman di `DatabaseModule` (pool Postgres dulu tidak pernah benar-benar ditutup saat shutdown).
  - [x] Redis caching (permission checks) — cache-aside pada
        `AuthorizationService` via `PermissionsCacheService` (key
        `permissions:user:{id}`, TTL 300s sebagai jaring pengaman,
        fail-safe penuh terhadap error Redis). Invalidation eksplisit
        terpasang di 5 titik mutasi: - `RolesService.assignToUser` / `revokeFromUser` — invalidate
        1 user (`invalidateUser`) - `RolesService.syncPermissions` — invalidate SEMUA user
        pemegang role itu (`invalidateUsers`) - `RolesService.delete` — daftar user diambil **sebelum**
        delete (`ON DELETE CASCADE` menghapus baris `user_roles`
        begitu role dihapus) - `PermissionsService.delete` — fan-out lintas SEMUA role
        yang punya permission ini, via satu query JOIN di
        `AuthorizationRepository.findUserIdsAffectedByPermission`,
        diambil **sebelum** delete (alasan cascade sama seperti di
        atas) - `PermissionsService.update` — HANYA kalau `name` benar-benar
        berubah (cache menyimpan nama permission, bukan ID; ganti
        `description` saja tidak perlu invalidation)
        `RedisModule` (Docker Compose `redis:7-alpine`, health check
        terpisah dari aggregator utama) dan test unit lengkap di
        `permissions-cache.service.spec.ts`, `authorization.service.spec.ts`,
        `roles.service.spec.ts`, `permissions.service.spec.ts`.
  - [~] Testing — **unit test SELESAI** (~140 test: util murni, guards,
    filter/interceptor, `AuthService`, `RefreshTokensService`,
    `UsersService`, `ProfilesService`, `AvatarStorageService`,
    `RolesService`, `PermissionsService`). **E2E test DIJEDA** —
    infra bootstrap, alur auth, RBAC, dan update README terkait
    belum dikerjakan. Lanjutkan ini sebelum deploy ke production.
  - [x] Audit log module — tabel `audit_logs` (actor + snapshot email,
        action bebas non-enum, resource, metadata jsonb, index
        `actorUserId`/`createdAt`), `AuditLogService.record()`
        best-effort (gagal nulis log TIDAK menggagalkan operasi
        bisnis), terintegrasi di: `AuthService` (register, login
        sukses/gagal dgn alasan, logout, logout-all), `RolesService` +
        `PermissionsService` (CRUD + assign/revoke/sync — actor = admin
        yang melakukan, bukan resource-nya), `ProfilesService` (avatar
        update/reset — self-service, tanpa actor terpisah). Endpoint
        admin `GET /audit-logs` (pagination + filter actorUserId/
        action/resourceType, permission baru `audit-log:read`).
  - [ ] CI pipeline (GitHub Actions: lint → test → build)
  - [ ] Dockerfile production (multi-stage build)
- [ ] **Phase 7 — Frontend Svelte** (simulasi UI untuk testing manual seluruh fitur backend)
