/**
 * Token DI untuk instance Drizzle. Dipakai lewat @Inject(DRIZZLE)
 * di repository layer, bukan import langsung, supaya gampang di-mock
 * saat unit test.
 */
export const DRIZZLE = Symbol('DRIZZLE_CONNECTION');

/**
 * Token DI untuk raw `pg.Pool`. HANYA dipakai secara internal oleh
 * DatabaseModule sendiri (untuk graceful shutdown via `pool.end()`) —
 * SENGAJA tidak di-export dari DatabaseModule, supaya modul lain tidak
 * tergoda query langsung lewat `pg` dan melewati Drizzle (bypass
 * type-safety + repository pattern).
 */
export const PG_POOL = Symbol('PG_POOL');

export type DrizzleDb = ReturnType<
  typeof import('drizzle-orm/node-postgres').drizzle<
    typeof import('./schema').schema
  >
>;
