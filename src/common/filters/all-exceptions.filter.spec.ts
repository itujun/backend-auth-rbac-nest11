import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

type JsonBody = Record<string, unknown>;

/**
 * `jsonMock.mock.calls` bertipe `any[][]` (bawaan `jest.Mock` tanpa
 * generic). Cast ke tipe konkret DI SINI SAJA (satu tempat, satu kali)
 * lewat `as unknown as` — variabel `calls` sesudahnya punya tipe statis
 * asli, jadi akses property selanjutnya AMAN, tidak lagi kena
 * @typescript-eslint/no-unsafe-member-access di tiap titik pemakaian.
 */
function lastJsonBody(mock: jest.Mock): JsonBody {
  const calls = mock.mock.calls as unknown as JsonBody[][];
  return calls[calls.length - 1][0];
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    // Logger.error nulis ke console — disenyapkan supaya output test bersih,
    // BUKAN karena kita tidak peduli filter ini benar-benar log error 500.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    filter = new AllExceptionsFilter();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => ({ url: '/api/test', method: 'GET' }),
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => jest.restoreAllMocks());

  it('meneruskan status code & message dari HttpException biasa (mis. ConflictException)', () => {
    filter.catch(new ConflictException('Email sudah terdaftar'), host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.CONFLICT,
        message: 'Email sudah terdaftar',
      }),
    );
    // Tidak boleh ada field `errors` kalau bukan kasus validasi
    expect(lastJsonBody(jsonMock).errors).toBeUndefined();
  });

  it('mengubah body ValidationPipe ({message: string[]}) jadi errors array + pesan generik', () => {
    filter.catch(
      new BadRequestException({
        message: ['email harus diisi', 'password minimal 8 karakter'],
        error: 'Bad Request',
      }),
      host,
    );

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validasi gagal',
        errors: ['email harus diisi', 'password minimal 8 karakter'],
      }),
    );
  });

  it('TIDAK membuang detail kalau body exception tanpa field message string (mis. HealthCheckResult)', () => {
    const healthCheckBody = {
      status: 'error',
      info: {},
      error: { database: { status: 'down', message: 'connect ECONNREFUSED' } },
      details: { database: { status: 'down' } },
    };

    filter.catch(
      new HttpException(healthCheckBody, HttpStatus.SERVICE_UNAVAILABLE),
      host,
    );

    const body = lastJsonBody(jsonMock);
    expect(body.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    // Detail lengkap harus tetap ada, cuma dipindah ke `errors`
    expect(body.errors).toEqual(healthCheckBody);
  });

  it('menyembunyikan detail Error tak terduga (bug/DB down) dari client', () => {
    filter.catch(
      new Error('Kredensial DB salah, host: internal-db-prod'),
      host,
    );

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = lastJsonBody(jsonMock);
    expect(body.message).toBe('Terjadi kesalahan pada server');
    expect(JSON.stringify(body)).not.toContain('internal-db-prod');
  });

  it('selalu menyertakan timestamp & path request yang gagal', () => {
    filter.catch(new ConflictException('x'), host);

    const body = lastJsonBody(jsonMock);
    expect(body.path).toBe('/api/test');
    expect(typeof body.timestamp).toBe('string');
  });
});
