# Backend Auth + RBAC — NestJS 11 + Drizzle + Svelte

Project latihan backend fundamentals: auth (JWT + refresh rotation),
RBAC (role/permission), file upload + kompresi, clean architecture,
repository pattern, dan standard API response.

## Tech Stack

- **Backend**: NestJS 11 + TypeScript
- **ORM**: Drizzle ORM (PostgreSQL)
- **Auth**: JWT (access token) + refresh token via httpOnly cookie, rotasi & revoke
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

## Script Database (Drizzle Kit)

| Script              | Fungsi                                                        |
| -------------------- | --------------------------------------------------------------- |
| `npm run db:generate` | Generate file migration SQL baru dari perubahan schema         |
| `npm run db:migrate`  | Terapkan migration yang belum berjalan ke database              |
| `npm run db:push`     | Push schema langsung ke DB tanpa file migration (khusus prototyping cepat, hindari di kerja tim) |
| `npm run db:studio`   | Buka Drizzle Studio (GUI browser untuk lihat isi database)       |

## Arsitektur

```
src/
  common/          # Cross-cutting concern lintas modul
    decorators/    # @ResponseMessage, dst
    filters/       # AllExceptionsFilter (format error konsisten)
    interceptors/  # ResponseInterceptor (format response konsisten)
    interfaces/     # Kontrak tipe bersama (ApiResponse, PaginatedResult)
  config/          # Konfigurasi terpusat + validasi env (fail-fast)
  core/
    repositories/  # BaseRepository — DI wiring dasar untuk semua repository
  database/
    schema/        # Definisi tabel Drizzle (source of truth struktur DB)
    migrations/    # File migration SQL yang di-generate dari schema
    database.module.ts  # Provider koneksi Postgres + instance Drizzle (global)
  modules/         # Feature module (auth, profile, role, permission — menyusul)
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

| Method | Endpoint               | Auth?     | Deskripsi                                |
| ------ | ----------------------- | --------- | ------------------------------------------ |
| GET    | `/api/health`            | Public    | Health check                               |
| POST   | `/api/auth/register`     | Public    | Registrasi user baru + auto-create profile |
| POST   | `/api/auth/login`        | Public    | Login → `accessToken` di body, `refresh_token` di httpOnly cookie |
| POST   | `/api/auth/refresh`      | Public*   | Tukar refresh token (cookie) dengan access token + refresh token baru (rotasi) |
| POST   | `/api/auth/logout`       | Public*   | Revoke sesi saat ini (device ini saja)     |
| POST   | `/api/auth/logout-all`   | Protected | Revoke SEMUA sesi milik user (butuh access token) |
| GET    | `/api/auth/me`           | Protected | Data user yang sedang login                |

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

| Method | Endpoint                | Permission          | Deskripsi                  |
| ------ | ------------------------ | -------------------- | ---------------------------- |
| GET    | `/api/permissions`        | `permission:read`    | Daftar semua permission      |
| GET    | `/api/permissions/:id`    | `permission:read`    | Detail satu permission       |
| POST   | `/api/permissions`        | `permission:create`  | Buat permission baru         |
| PATCH  | `/api/permissions/:id`    | `permission:update`  | Ubah permission              |
| DELETE | `/api/permissions/:id`    | `permission:delete`  | Hapus permission             |

### Roles

| Method | Endpoint                          | Permission               | Deskripsi                              |
| ------ | ----------------------------------- | -------------------------- | ----------------------------------------- |
| GET    | `/api/roles`                        | `role:read`                 | Daftar semua role                        |
| GET    | `/api/roles/:id`                    | `role:read`                 | Detail satu role                         |
| POST   | `/api/roles`                        | `role:create`                | Buat role baru                           |
| PATCH  | `/api/roles/:id`                    | `role:update`                | Ubah role (nama/deskripsi)               |
| DELETE | `/api/roles/:id`                    | `role:delete`                | Hapus role (cascade ke assignment-nya)   |
| GET    | `/api/roles/:id/permissions`        | `role:read`                 | Daftar permission milik role ini         |
| PUT    | `/api/roles/:id/permissions`        | `role:manage-permissions`    | Ganti SELURUH daftar permission role ini (`{"permissionIds":[1,2,3]}`) |
| GET    | `/api/roles/:id/users`              | `role:read`                 | Daftar user pemilik role ini             |
| POST   | `/api/roles/:id/users/:userId`      | `role:manage-users`          | Assign role ke user                      |
| DELETE | `/api/roles/:id/users/:userId`      | `role:manage-users`          | Cabut role dari user                     |

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
- [ ] **Phase 4 — Profile Module** (CRUD + upload avatar + kompresi)
- [ ] **Phase 5 — List Features** (pagination, search, sort, filter — DRY layer)
- [ ] **Phase 6 — Frontend Svelte** (simulasi UI)
- [ ] **Phase 7 — Extras** (Swagger, rate limiting, tests, dll — opsional)
