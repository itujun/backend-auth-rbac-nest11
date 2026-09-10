import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';

/**
 * Format yang kita terima dari header `X-Request-Id` masuk: huruf,
 * angka, dash, underscore, maksimal 64 karakter. SENGAJA dibatasi
 * ketat -- header ini datang dari client/upstream service yang tidak
 * kita percaya sepenuhnya. Kalau isinya di luar format ini (kosong,
 * kepanjangan, karakter aneh), abaikan dan generate UUID baru sendiri
 * daripada mempercayai mentah-mentah nilai dari luar.
 */
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Dipisah jadi fungsi standalone (bukan inline di `pinoHttp.genReqId`)
 * supaya bisa di-unit-test langsung tanpa perlu bikin instance Express
 * Request/Response asli -- lihat `logger.config.spec.ts`.
 *
 * Dua sumber, sesuai prioritas:
 * 1. Header `X-Request-Id` yang SUDAH ada dari luar (API gateway, load
 *    balancer, atau service lain dalam alur multi-service -- mis.
 *    request dari service "order" yang memanggil service "payment").
 *    Kalau ada dan formatnya valid, PAKAI ULANG -- ini yang membuat
 *    satu ID bisa dipakai melacak satu request LINTAS BANYAK SERVICE,
 *    bukan cuma di dalam aplikasi ini.
 * 2. Kalau tidak ada / tidak valid (request langsung dari
 *    browser/Postman, atau header-nya "aneh") -- generate UUID v4 baru
 *    lewat `crypto.randomUUID()` bawaan Node (tidak perlu tambah
 *    dependency `uuid`).
 */
export function resolveRequestId(incomingHeader: unknown): string {
  return typeof incomingHeader === 'string' &&
    REQUEST_ID_PATTERN.test(incomingHeader)
    ? incomingHeader
    : randomUUID();
}

/**
 * Dipakai sebagai `useFactory` di `LoggerModule.forRootAsync()`
 * (app.module.ts). Dipisah ke file sendiri mengikuti pola
 * `swagger.config.ts` — konfigurasi yang cukup panjang tidak numpuk di
 * app.module.ts.
 */
export function createLoggerOptions(configService: ConfigService): Params {
  const level = configService.get<string>('logger.level') as string;
  const pretty = configService.get<boolean>('logger.pretty');

  return {
    pinoHttp: {
      level,
      // Pino default MENULIS level sebagai ANGKA di JSON (mis.
      // `"level":30` untuk info) -- irit beberapa byte per baris, tapi
      // tidak enak dibaca manusia DAN menyulitkan Alloy/Loki (lihat
      // `observability/alloy/config.alloy`, stage.labels) yang mau
      // mem-promosikan `level` jadi label Grafana yang manusiawi.
      // Override ini bikin JSON-nya `"level":"info"` -- cost-nya cuma
      // beberapa byte lebih besar per baris log, worth it untuk
      // keterbacaan + kemudahan query di Grafana.
      formatters: {
        level: (label: string) => ({ level: label }),
      },
      // 'pino-pretty' HARUS ter-install (lihat devDependencies) hanya
      // kalau `pretty` true — di production ini undefined, pino nulis
      // JSON mentah langsung ke stdout tanpa proses tambahan.
      transport: pretty
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:HH:MM:ss',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
      // req.headers.authorization = access token (Bearer JWT).
      // req.headers.cookie = refresh token httpOnly cookie.
      // res.headers['set-cookie'] = refresh token BARU saat login/refresh.
      // Ketiganya WAJIB disensor — jangan sampai kredensial tercatat utuh
      // di log. (Body request TIDAK perlu di-redact terpisah: pino-http
      // secara default tidak menyertakan body di log otomatisnya.)
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        censor: '**REDACTED**',
      },
      autoLogging: {
        // Health check dipanggil sangat sering oleh uptime monitor/load
        // balancer — kalau ikut ter-log otomatis, log jadi penuh noise
        // dan menyulitkan mencari log yang benar-benar penting.
        ignore: (req: Request) => req.url === '/api/health',
      },
      // Default pino-http selalu 'info' untuk request sukses. Override
      // ini supaya level log mencerminkan tingkat keparahan respons:
      // 5xx pantas dicari lewat filter 'error', 4xx lewat 'warn', bukan
      // tenggelam di antara ribuan log 'info' yang sama-sama level info.
      customLogLevel: (
        _req: Request,
        res: Response,
        err?: Error,
      ): 'error' | 'warn' | 'info' => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      // Request/Tracking ID. Nilai return `resolveRequestId()` otomatis
      // jadi `req.id` pino-http, yang berkat mekanisme AsyncLocalStorage
      // di nestjs-pino, OTOMATIS ikut nempel (sebagai field `reqId`) di
      // SEMUA baris log dalam request ini -- termasuk yang dipanggil
      // jauh di dalam service manapun lewat `new Logger(X.name)` biasa
      // dari '@nestjs/common' (RefreshTokensService, PermissionsCacheService,
      // dst) TANPA perlu ubah satupun kode di file-file itu.
      genReqId: (req: Request, res: Response): string => {
        const id = resolveRequestId(req.headers['x-request-id']);

        // Dikembalikan lewat response header supaya:
        // 1. Frontend bisa tangkap ID ini dan tampilkan/lampirkan kalau
        //    user lapor bug -- jauh lebih presisi dibanding "tadi error
        //    pas saya klik simpan, tapi lupa jam berapa".
        // 2. Kalau request ini nanti diteruskan lagi ke service lain di
        //    hilir, ID yang sama bisa dibawa lewat header yang sama,
        //    menyambung rantai trace lintas service (lihat poin 1 di atas).
        // CATATAN: browser JS TIDAK bisa baca header response
        // cross-origin ini secara default -- lihat `exposedHeaders` di
        // `app.enableCors()`, main.ts, yang mengizinkannya secara eksplisit.
        res.setHeader('X-Request-Id', id);

        return id;
      },
    },
  };
}
