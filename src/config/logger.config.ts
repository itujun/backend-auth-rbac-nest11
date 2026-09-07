import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';

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
    },
  };
}
