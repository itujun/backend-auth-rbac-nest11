/**
 * Token DI untuk instance ioredis client. Dipakai lewat @Inject(REDIS_CLIENT)
 * di service manapun yang butuh baca/tulis cache -- bukan import langsung
 * dari 'ioredis' + bikin instance sendiri di tiap tempat, supaya:
 *   1. Satu koneksi/connection-pool dipakai bersama di seluruh aplikasi
 *      (bukan tiap service buka koneksi TCP sendiri-sendiri ke Redis).
 *   2. Gampang di-mock saat unit test (sama seperti pola DRIZZLE di
 *      database.constants.ts).
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
