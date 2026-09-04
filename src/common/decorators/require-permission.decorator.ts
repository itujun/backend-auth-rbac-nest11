import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Contoh: @RequirePermission('role:create')
 * Bisa juga lebih dari satu (semua harus dipenuhi / AND):
 *   @RequirePermission('role:update', 'role:manage-permissions')
 *
 * Konvensi nama permission: "resource:action" (lihat komentar di
 * database/schema/permissions.schema.ts).
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
