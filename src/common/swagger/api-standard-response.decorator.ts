import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiSuccessEnvelope } from './api-success-envelope.model';

interface ApiStandardResponseOptions {
  /** HTTP status code untuk contoh response ini. Default 200. */
  status?: number;
  /** Deskripsi singkat di Swagger UI. */
  description?: string;
  /** `data` berupa array biasa (bukan hasil pagination). */
  isArray?: boolean;
  /**
   * `data` berupa hasil pagination (array) DAN field `meta`
   * (page/limit/total/totalPages) ikut ditampilkan di contoh schema.
   * Lihat `ResponseInterceptor.isPaginatedShape()` — inilah yang membuat
   * `meta` muncul di response asli untuk endpoint list.
   */
  paginated?: boolean;
}

/**
 * Bungkus dokumentasi tipe `data` di dalam bentuk `ApiSuccessEnvelope`
 * (sesuai `ResponseInterceptor` global aplikasi ini), supaya Swagger UI
 * menampilkan bentuk response YANG SEBENARNYA dikirim ke client —
 * bukan cuma DTO mentah tanpa `success`/`statusCode`/`message`/dst.
 *
 * Pemakaian:
 *   @ApiStandardResponse(UserResponseDto)                         // objek tunggal
 *   @ApiStandardResponse(UserResponseDto, { isArray: true })      // array biasa
 *   @ApiStandardResponse(UserResponseDto, { paginated: true })    // hasil list + pagination
 *   @ApiStandardResponse(UserResponseDto, { status: 201, description: 'User dibuat' })
 */
export function ApiStandardResponse<TModel extends Type<unknown>>(
  model: TModel,
  options: ApiStandardResponseOptions = {},
) {
  const {
    status = 200,
    description,
    isArray = false,
    paginated = false,
  } = options;
  const dataIsArray = isArray || paginated;

  return applyDecorators(
    ApiExtraModels(ApiSuccessEnvelope, model),
    ApiResponse({
      status,
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiSuccessEnvelope) },
          {
            properties: {
              data: dataIsArray
                ? { type: 'array', items: { $ref: getSchemaPath(model) } }
                : { $ref: getSchemaPath(model) },
            },
          },
        ],
      },
    }),
  );
}
