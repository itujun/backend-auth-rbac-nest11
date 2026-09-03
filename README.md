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

## Catatan Teknis: ESM-only dependencies + Jest

Beberapa package terbaru (`@nestjs/config`, `@nestjs/jwt`,
`@nestjs/passport`, `drizzle-orm`, `@standard-schema/spec`) sudah
ship sebagai **pure ESM** (`"type": "module"` di package.json mereka),
sementara project ini jalan dalam mode CommonJS. Aplikasi utama
(`node dist/src/main.js`) tidak masalah, tapi **Jest** menolak me-
`require()` file ESM tersebut secara default.

Fix-nya: `transformIgnorePatterns` di `package.json` (unit test) dan
`test/jest-e2e.json` (e2e test) di-override supaya ts-jest ikut
mentransform package-package tersebut jadi CommonJS sebelum dijalankan.
Kalau nanti nambah dependency baru dan Jest tiba-tiba error
`"Must use import to load ES Module"`, kemungkinan besar dependency
itu juga ESM-only — tinggal tambahkan namanya ke pattern yang sama.

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
- [ ] **Phase 3 — RBAC** (role, permission, CRUD, permission guard)
- [ ] **Phase 3 — RBAC** (role, permission, CRUD, permission guard)
- [ ] **Phase 4 — Profile Module** (CRUD + upload avatar + kompresi)
- [ ] **Phase 5 — List Features** (pagination, search, sort, filter — DRY layer)
- [ ] **Phase 6 — Frontend Svelte** (simulasi UI)
- [ ] **Phase 7 — Extras** (Swagger, rate limiting, tests, dll — opsional)
