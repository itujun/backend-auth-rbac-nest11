import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'response_message';

/**
 * Contoh pemakaian:
 *
 *   @ResponseMessage('User berhasil didaftarkan')
 *   @Post('register')
 *   register(@Body() dto: RegisterDto) { ... }
 *
 * Kalau tidak dipakai, ResponseInterceptor akan pakai default message
 * berdasarkan HTTP method (GET/POST/PATCH/DELETE).
 */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
