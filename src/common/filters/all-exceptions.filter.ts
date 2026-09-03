import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '../interfaces/api-response.interface';

/**
 * Menangkap SEMUA exception (HttpException maupun error tak terduga)
 * dan mengubahnya jadi bentuk response yang konsisten, supaya frontend
 * tidak perlu handle banyak variasi shape error.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: unknown;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const bodyObj = body as Record<string, unknown>;
        // class-validator ValidationPipe melempar { message: string[] }
        if (Array.isArray(bodyObj.message)) {
          message = 'Validasi gagal';
          errors = bodyObj.message;
        } else {
          message = (bodyObj.message as string) ?? exception.message;
        }
      }
    } else if (exception instanceof Error) {
      // Error tak terduga (bug, DB down, dll) — jangan bocorkan stack
      // trace/internal detail ke client, tapi log lengkap di server.
      message = 'Terjadi kesalahan pada server';
      this.logger.error(exception.message, exception.stack);
    }

    if (statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> 500`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const errorResponse: ApiErrorResponse = {
      success: false,
      statusCode,
      message,
      ...(errors ? { errors } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(errorResponse);
  }
}
