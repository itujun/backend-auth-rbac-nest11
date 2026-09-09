import { Injectable, Logger } from '@nestjs/common';
import { AuditLogRepository } from './audit-log.repository';

/**
 * Union string literal (BUKAN enum Postgres — lihat komentar di
 * audit-logs.schema.ts) supaya nama action konsisten & type-safe di
 * SISI APLIKASI (autocomplete, typo langsung ketahuan saat compile),
 * tanpa mengorbankan fleksibilitas skema DB untuk menambah jenis event
 * baru kapan saja tanpa migration.
 */
export type AuditAction =
  | 'auth.register'
  | 'auth.login_success'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.logout_all'
  | 'role.create'
  | 'role.update'
  | 'role.delete'
  | 'role.assign_user'
  | 'role.revoke_user'
  | 'role.sync_permissions'
  | 'permission.create'
  | 'permission.update'
  | 'permission.delete'
  | 'profile.avatar_update'
  | 'profile.avatar_reset';

/**
 * Identitas admin yang MELAKUKAN aksi CRUD (role/permission/dst) —
 * beda dari actor di event auth (yang subjeknya user itu sendiri).
 * Dipakai RolesService & PermissionsService supaya controller tidak
 * perlu tahu bentuk `RecordAuditLogInput` yang lebih detail.
 */
export interface AuditActor {
  userId: number;
  email: string;
}

export interface RecordAuditLogInput {
  action: AuditAction;
  /** null untuk event tanpa actor jelas, mis. login gagal dengan email yang tidak terdaftar. */
  actorUserId?: number | null;
  actorEmail?: string | null;
  resourceType?: string | null;
  resourceId?: string | number | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  /**
   * SENGAJA tidak pernah melempar exception ke pemanggil. Audit log
   * penting untuk forensik/kepatuhan, TAPI kegagalan mencatatnya tidak
   * boleh menggagalkan operasi bisnis utama yang sudah berhasil (mis.
   * user berhasil login, tapi baris audit gagal ditulis karena DB
   * sesaat bermasalah) — pola defensif yang sama seperti
   * `pool.on('error')` di DatabaseModule dan `deleteIfCustom()` di
   * AvatarStorageService.
   */
  async record(input: RecordAuditLogInput): Promise<void> {
    try {
      await this.auditLogRepository.create({
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        actorEmail: input.actorEmail ?? null,
        resourceType: input.resourceType ?? null,
        resourceId:
          input.resourceId === undefined || input.resourceId === null
            ? null
            : String(input.resourceId),
        metadata: input.metadata ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
    } catch (err) {
      this.logger.error(
        `Gagal mencatat audit log untuk action "${input.action}": ${String(err)}`,
      );
    }
  }
}
