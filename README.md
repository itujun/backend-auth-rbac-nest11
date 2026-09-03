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

## Progress Roadmap

- [x] **Phase 0 — Fondasi & Arsitektur**
      Config + env validation, Drizzle setup (7 tabel sesuai ERD),
      Docker Compose Postgres, standard response wrapper, global
      exception filter, base repository pattern, clean folder structure.
- [ ] **Phase 1 — Auth MVP** (register, login, JWT access token, guard)
- [ ] **Phase 2 — Refresh Token System** (cookie, rotasi, revoke)
- [ ] **Phase 3 — RBAC** (role, permission, CRUD, permission guard)
- [ ] **Phase 4 — Profile Module** (CRUD + upload avatar + kompresi)
- [ ] **Phase 5 — List Features** (pagination, search, sort, filter — DRY layer)
- [ ] **Phase 6 — Frontend Svelte** (simulasi UI)
- [ ] **Phase 7 — Extras** (Swagger, rate limiting, tests, dll — opsional)
