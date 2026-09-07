import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';

function createContext(method: string, url: string, statusCode = 200) {
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ method, url }),
      getResponse: () => ({ statusCode }),
    }),
    getHandler: () => jest.fn(),
  } as unknown as ExecutionContext;
  return context;
}

function createHandler<T>(result: T): CallHandler<T> {
  return { handle: () => of(result) };
}

describe('ResponseInterceptor', () => {
  it('membungkus hasil biasa dengan pesan default sesuai HTTP method', async () => {
    const reflector = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const interceptor = new ResponseInterceptor(reflector);
    const context = createContext('POST', '/api/roles', 201);

    const result = await firstValueFrom(
      interceptor.intercept(context, createHandler({ id: 1, name: 'editor' })),
    );

    expect(result).toMatchObject({
      success: true,
      statusCode: 201,
      message: 'Data berhasil dibuat',
      data: { id: 1, name: 'editor' },
    });
    expect(result.meta).toBeUndefined();
  });

  it('memakai pesan dari @ResponseMessage() kalau ada, bukan default per-method', async () => {
    const reflector = {
      get: jest.fn().mockReturnValue('Registrasi berhasil'),
    } as unknown as Reflector;
    const interceptor = new ResponseInterceptor(reflector);
    const context = createContext('POST', '/api/auth/register', 201);

    const result = await firstValueFrom(
      interceptor.intercept(context, createHandler({ id: 1 })),
    );

    expect(result.message).toBe('Registrasi berhasil');
    expect(reflector.get).toHaveBeenCalledWith(
      RESPONSE_MESSAGE_KEY,
      expect.anything(),
    );
  });

  it('mendeteksi bentuk paginated ({items, meta}) dan memindahkan meta ke level atas', async () => {
    const reflector = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const interceptor = new ResponseInterceptor(reflector);
    const context = createContext('GET', '/api/roles', 200);

    const paginatedResult = {
      items: [{ id: 1 }, { id: 2 }],
      meta: { page: 1, limit: 10, totalItems: 2, totalPages: 1 },
    };

    const result = await firstValueFrom(
      interceptor.intercept(context, createHandler(paginatedResult)),
    );

    expect(result.data).toEqual(paginatedResult.items);
    expect(result.meta).toEqual(paginatedResult.meta);
  });

  it('TIDAK menganggap objek biasa yang kebetulan punya field lain sebagai paginated', async () => {
    const reflector = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const interceptor = new ResponseInterceptor(reflector);
    const context = createContext('GET', '/api/health', 200);

    // Bentuk HealthCheckResult dari Terminus: tidak punya `items`/`meta`
    const healthResult = { status: 'ok', info: {}, error: {}, details: {} };

    const result = await firstValueFrom(
      interceptor.intercept(context, createHandler(healthResult)),
    );

    expect(result.data).toEqual(healthResult);
    expect(result.meta).toBeUndefined();
  });

  it('selalu menyertakan timestamp (ISO string) dan path dari request', async () => {
    const reflector = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const interceptor = new ResponseInterceptor(reflector);
    const context = createContext('GET', '/api/permissions', 200);

    const result = await firstValueFrom(
      interceptor.intercept(context, createHandler([])),
    );

    expect(result.path).toBe('/api/permissions');
    expect(() => new Date(result.timestamp)).not.toThrow();
  });
});
