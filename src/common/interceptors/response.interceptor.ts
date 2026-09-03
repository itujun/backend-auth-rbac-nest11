import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { ApiSuccessResponse } from '../interfaces/api-response.interface';

const DEFAULT_MESSAGE_BY_METHOD: Record<string, string> = {
  GET: 'Data berhasil diambil',
  POST: 'Data berhasil dibuat',
  PATCH: 'Data berhasil diperbarui',
  PUT: 'Data berhasil diperbarui',
  DELETE: 'Data berhasil dihapus',
};

/** Bentuk yang dikenali sebagai hasil paginated dari service/repository. */
interface PaginatedShape<T> {
  items: T[];
  meta: Record<string, unknown>;
}

function isPaginatedShape(value: unknown): value is PaginatedShape<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as PaginatedShape<unknown>).items) &&
    typeof (value as PaginatedShape<unknown>).meta === 'object'
  );
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T>> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const customMessage = this.reflector.get<string | undefined>(
      RESPONSE_MESSAGE_KEY,
      context.getHandler(),
    );

    return next.handle().pipe(
      map((result) => {
        const statusCode = response.statusCode;
        const message =
          customMessage ??
          DEFAULT_MESSAGE_BY_METHOD[request.method] ??
          'Success';

        const base = {
          success: true as const,
          statusCode,
          message,
          timestamp: new Date().toISOString(),
          path: request.url,
        };

        if (isPaginatedShape(result)) {
          return {
            ...base,
            data: result.items,
            meta: result.meta,
          } as ApiSuccessResponse<T>;
        }

        return {
          ...base,
          data: result,
        };
      }),
    );
  }
}
