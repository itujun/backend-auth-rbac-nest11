import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProfilesRepository, UpdateProfileFields } from './profiles.repository';
import { AvatarStorageService } from './storage/avatar-storage.service';
import { DEFAULT_AVATAR_URL } from '../../database/schema';
import { AuditLogService, AuditActor } from '../audit-log/audit-log.service';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly profilesRepository: ProfilesRepository,
    private readonly avatarStorageService: AvatarStorageService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getByUserIdOrThrow(userId: number) {
    const profile = await this.profilesRepository.findByUserId(userId);
    if (!profile) {
      // Seharusnya tidak pernah kejadian — profile dibuat otomatis
      // bersamaan dengan user saat register (lihat UsersRepository
      // .createWithProfile, Phase 1). Dijaga tetap eksplisit untuk
      // kasus data lama/migrasi yang mungkin tidak konsisten.
      throw new NotFoundException(
        `Profile untuk user id ${userId} tidak ditemukan`,
      );
    }
    return profile;
  }

  async updateOwn(userId: number, dto: UpdateProfileFields, actor: AuditActor) {
    await this.getByUserIdOrThrow(userId);
    const updated = await this.profilesRepository.updateByUserId(userId, dto);

    // actor bisa berbeda dari userId (mis. admin ubah profile user lain
    // lewat updateByUserId di bawah, yang delegasi ke sini) — makanya
    // actorUserId/email diambil dari `actor`, bukan diasumsikan = userId.
    await this.auditLogService.record({
      action: 'profile.update',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      resourceType: 'profile',
      resourceId: userId,
    });

    return updated;
  }

  /** Dipakai endpoint admin (PATCH /profiles/:userId) — logic sama, dipisah biar intent-nya jelas di controller/route. */
  updateByUserId(userId: number, dto: UpdateProfileFields, actor: AuditActor) {
    return this.updateOwn(userId, dto, actor);
  }

  async updateAvatar(userId: number, file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        'File avatar wajib diupload (field "avatar")',
      );
    }

    const profile = await this.getByUserIdOrThrow(userId);
    const oldAvatarUrl = profile.avatarUrl;

    const newAvatarUrl = await this.avatarStorageService.saveAvatar(
      file.buffer,
      file.mimetype,
      userId,
    );

    const updated = await this.profilesRepository.updateAvatarUrl(
      userId,
      newAvatarUrl,
    );

    // Cleanup avatar lama SETELAH avatar baru berhasil disimpan & DB
    // ter-update — urutan ini penting supaya kalau ada kegagalan di
    // tengah jalan, user tidak berakhir tanpa avatar sama sekali.
    await this.avatarStorageService.deleteIfCustom(oldAvatarUrl);

    // Selalu self-service (userId = orang yang upload avatar-nya
    // sendiri) — tidak ada endpoint admin untuk ganti avatar user lain,
    // makanya tidak butuh parameter `actor` terpisah seperti di
    // RolesService/PermissionsService.
    await this.auditLogService.record({
      action: 'profile.avatar_update',
      actorUserId: userId,
      resourceType: 'profile',
      resourceId: userId,
    });

    return updated;
  }

  async resetAvatar(userId: number) {
    const profile = await this.getByUserIdOrThrow(userId);

    if (profile.avatarUrl !== DEFAULT_AVATAR_URL) {
      await this.avatarStorageService.deleteIfCustom(profile.avatarUrl);
    }

    const updated = await this.profilesRepository.updateAvatarUrl(
      userId,
      DEFAULT_AVATAR_URL,
    );

    await this.auditLogService.record({
      action: 'profile.avatar_reset',
      actorUserId: userId,
      resourceType: 'profile',
      resourceId: userId,
    });

    return updated;
  }
}
