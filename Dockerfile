# Dockerfile PRODUCTION -- multi-stage, tanpa devDependencies di image
# akhir, non-root user. Untuk dev/demo observability, pakai
# Dockerfile.dev (lihat komentar di file itu kenapa keduanya sengaja
# dipisah).

# =============================================================================
# Stage 1: builder -- compile TypeScript -> JavaScript (butuh devDependencies:
# @nestjs/cli, typescript, dst -- makanya `npm ci` PENUH di stage ini, bukan
# --omit=dev)
# =============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Layer terpisah dari `COPY . .` -- cache Docker cuma invalidasi step
# `npm ci` kalau package.json/package-lock.json berubah, bukan tiap ada
# perubahan source code.
COPY package.json package-lock.json ./
RUN npm ci

# File yang benar-benar dibutuhkan `nest build` saja -- BUKAN `COPY . .`,
# supaya perubahan pada file tak relevan (README.md, docker-compose.yml,
# dst) tidak ikut invalidasi cache layer manapun di sini.
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

# Hasil: dist/ (JS terkompilasi) + asset avatar default ikut ke-copy
# otomatis lewat config "assets" di nest-cli.json (lihat
# AvatarStorageService.onModuleInit -- dia baca dari
# dist/src/modules/profiles/assets/default-avatar.png).
RUN npm run build

# =============================================================================
# Stage 2: prod-deps -- install ULANG dari nol, KALI INI cuma dependencies
# production (--omit=dev). Sengaja instalasi terpisah dari stage builder
# (bukan `npm prune` dari node_modules builder) supaya image akhir dijamin
# benar-benar bersih dari devDependencies, tanpa bergantung pada perilaku
# `npm prune` yang kadang punya edge case dengan optional/native deps
# (argon2, sharp).
# =============================================================================
FROM node:22-alpine AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# =============================================================================
# Stage 3: runner -- image akhir yang benar-benar jalan di production.
# Cuma berisi: runtime Node, node_modules production, dist/ hasil build.
# TIDAK ada source TypeScript, TIDAK ada devDependencies, TIDAK ada
# test/, TIDAK ada file config yang tidak relevan di runtime.
# =============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# node:22-alpine SUDAH menyediakan user non-root bernama `node` (uid/gid
# 1000) bawaan image resmi -- tidak perlu bikin user baru sendiri.
# `--chown` di setiap COPY di bawah memastikan file dimiliki user itu,
# BUKAN root, dari awal (menghindari langkah `chown -R` terpisah yang
# menambah satu layer besar lagi).
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

# Folder ini SEKARANG HANYA untuk default avatar (asset bundled, di-copy
# oleh AvatarStorageService.onModuleInit saat start) -- avatar upload
# user sejak migrasi ke Cloudflare R2 TIDAK LAGI ditulis ke sini sama
# sekali. Tetap harus ada & writable sebelum app start karena mkdir
# recursive di onModuleInit() akan gagal permission denied kalau WORKDIR
# masih dimiliki root sementara proses jalan sebagai user `node`.
#
# CATATAN PERSISTENCE: BERBEDA dari sebelum migrasi R2 -- folder ini
# TIDAK PERLU LAGI di-mount sebagai volume terpisah. Isinya cuma default
# avatar yang ikut ter-bundle di image (regenerasi otomatis tiap start
# kalau belum ada), bukan data user yang perlu persist.
RUN mkdir -p uploads/avatars && chown -R node:node uploads

USER node

EXPOSE 3000

# Cek endpoint health betulan (Terminus, verifikasi koneksi Postgres asli
# -- lihat HealthModule), BUKAN cuma "proses hidup". wget dipakai karena
# itu yang tersedia bawaan di Alpine (BusyBox), curl tidak terpasang
# default. ${PORT:-3000} mengikuti env PORT kalau di-override, fallback
# ke 3000 (default aplikasi) kalau tidak.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3000}/api/health" || exit 1

# Bentuk exec (array), BUKAN bentuk shell (`CMD node dist/main`) --
# supaya `node` benar-benar jadi PID 1 dan menerima SIGTERM langsung
# dari Docker/orchestrator untuk graceful shutdown
# (app.enableShutdownHooks() di main.ts menangani sinyal ini). Bentuk
# shell akan membungkusnya lewat `/bin/sh -c`, yang MENELAN sinyal
# tersebut sebelum sampai ke proses Node.
CMD ["node", "dist/main"]