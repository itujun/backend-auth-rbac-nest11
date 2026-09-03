import { createHash } from 'node:crypto';

/**
 * Hash untuk REFRESH TOKEN — sengaja BEDA dari HashingService (argon2)
 * yang dipakai untuk password.
 *
 * Kenapa beda algoritma?
 * - Password itu low-entropy (manusia yang mengarang), makanya butuh
 *   algoritma LAMBAT (argon2/bcrypt) yang tahan brute-force, dan
 *   di-salt acak supaya hash yang sama tidak bisa di-lookup langsung.
 * - Refresh token itu HIGH-entropy (kita generate random 64 byte),
 *   jadi brute-force sudah mustahil secara matematis. Yang kita
 *   butuhkan justru hash CEPAT & deterministik (SHA-256) supaya bisa
 *   di-lookup langsung lewat `WHERE token_hash = ?` di database —
 *   argon2 tidak bisa dipakai untuk ini karena hasilnya beda tiap kali
 *   walau input sama (karena salt acak).
 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
