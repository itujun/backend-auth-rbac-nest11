import { User } from '../../../database/schema';

/**
 * Bentuk user yang aman dikirim ke client — tanpa passwordHash.
 * Dipakai sebagai return type di layer service/controller supaya
 * TypeScript sendiri yang "memaksa" kita tidak lupa strip field sensitif.
 */
export type SafeUser = Omit<User, 'passwordHash'>;
