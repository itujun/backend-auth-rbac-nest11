/**
 * Token DI untuk instance Drizzle. Dipakai lewat @Inject(DRIZZLE)
 * di repository layer, bukan import langsung, supaya gampang di-mock
 * saat unit test.
 */
export const DRIZZLE = Symbol('DRIZZLE_CONNECTION');

export type DrizzleDb = ReturnType<
  typeof import('drizzle-orm/node-postgres').drizzle<
    typeof import('./schema').schema
  >
>;
