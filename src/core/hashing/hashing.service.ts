import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Dibungkus jadi service (bukan panggil argon2 langsung di AuthService)
 * supaya:
 * 1) Gampang di-mock di unit test (inject fake HashingService).
 * 2) Kalau suatu saat mau ganti algoritma (mis. argon2 -> scrypt),
 *    cukup ubah di satu tempat ini.
 */
@Injectable()
export class HashingService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }
}
