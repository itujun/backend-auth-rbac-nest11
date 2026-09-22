export * from './users.schema';
export * from './profiles.schema';
export * from './roles.schema';
export * from './permissions.schema';
export * from './role-permissions.schema';
export * from './user-roles.schema';
export * from './refresh-tokens.schema';
export * from './password-reset-tokens.schema';
export * from './email-verification-tokens.schema';
export * from './audit-logs.schema';

import { users, usersRelations } from './users.schema';
import { profiles, profilesRelations } from './profiles.schema';
import { roles, rolesRelations } from './roles.schema';
import { permissions, permissionsRelations } from './permissions.schema';
import {
  rolePermissions,
  rolePermissionsRelations,
} from './role-permissions.schema';
import { userRoles, userRolesRelations } from './user-roles.schema';
import { refreshTokens, refreshTokensRelations } from './refresh-tokens.schema';
import {
  passwordResetTokens,
  passwordResetTokensRelations,
} from './password-reset-tokens.schema';
import {
  emailVerificationTokens,
  emailVerificationTokensRelations,
} from './email-verification-tokens.schema';
import { auditLogs, auditLogsRelations } from './audit-logs.schema';

/**
 * Objek gabungan semua schema + relations, dipakai saat inisialisasi
 * drizzle client supaya Drizzle Query API (db.query.users.findMany({ with: {...} }))
 * bisa jalan dengan type-safety penuh.
 */
export const schema = {
  users,
  usersRelations,
  profiles,
  profilesRelations,
  roles,
  rolesRelations,
  permissions,
  permissionsRelations,
  rolePermissions,
  rolePermissionsRelations,
  userRoles,
  userRolesRelations,
  refreshTokens,
  refreshTokensRelations,
  passwordResetTokens,
  passwordResetTokensRelations,
  emailVerificationTokens,
  emailVerificationTokensRelations,
  auditLogs,
  auditLogsRelations,
};
