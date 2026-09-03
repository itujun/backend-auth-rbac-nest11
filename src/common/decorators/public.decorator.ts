import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Default aplikasi ini: SEMUA route protected (butuh JWT valid),
 * kecuali ditandai @Public() secara eksplisit. Ini pendekatan
 * "secure by default" — developer harus sadar & sengaja saat
 * membuka endpoint ke publik, bukan lupa pasang guard.
 *
 * Contoh: @Public() @Post('login') login(...) { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
