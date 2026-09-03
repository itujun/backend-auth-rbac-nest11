import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../../database/database.constants';
import type { DrizzleDb } from '../../database/database.constants';

/**
 * Base repository, sengaja dibuat MINIMAL.
 *
 * Kenapa tidak bikin satu generic CRUD class yang dipakai semua tabel
 * (misal `BaseRepository<T>` dengan `findAll()`, `create()`, dst)?
 * Karena Drizzle didesain type-safe per-tabel: tiap tabel punya kolom,
 * relasi, dan aturan bisnis query yang beda (mis. `users` butuh exclude
 * `deletedAt` di setiap query karena soft-delete, tabel lain tidak).
 * Memaksakan generic CRUD akan membuat kita kehilangan type-safety atau
 * malah menambah kompleksitas untuk menghindari kasus yang jarang.
 *
 * Sebagai gantinya: DRY dicapai lewat
 *  1) base class ini untuk DI wiring yang seragam,
 *  2) shared query helpers (mis. pagination/sorting/filtering builder
 *     di Phase 5) yang dipakai lintas repository,
 *  3) tiap repository tetap menulis method query sendiri yang eksplisit
 *     dan type-safe (findById, findByEmail, dst).
 */
export abstract class BaseRepository {
  constructor(@Inject(DRIZZLE) protected readonly db: DrizzleDb) {}
}
