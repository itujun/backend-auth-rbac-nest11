import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateUserWithProfileInput,
  UsersRepository,
} from './users.repository';
import { User } from '../../database/schema';
import { SafeUser } from './types/safe-user.type';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { HashingService } from '../../core/hashing/hashing.service';
import { AuditLogService, AuditActor } from '../audit-log/audit-log.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly hashingService: HashingService,
    private readonly auditLogService: AuditLogService,
  ) {}

  findAll(query: FindUsersQueryDto) {
    return this.usersRepository.findAll(query);
  }

  findByEmail(email: string) {
    return this.usersRepository.findByEmail(email);
  }

  findActiveById(id: number) {
    return this.usersRepository.findActiveById(id);
  }

  findById(id: number) {
    return this.usersRepository.findById(id);
  }

  async findByIdOrThrow(id: number): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User dengan id ${id} tidak ditemukan`);
    }
    return user;
  }

  createWithProfile(input: CreateUserWithProfileInput) {
    return this.usersRepository.createWithProfile(input);
  }

  /**
   * Passthrough tipis, TIDAK ada audit log di sini -- dipanggil dari
   * `AuthService.resetPassword()`, yang mencatat `password_reset.completed`
   * sendiri (AuthService yang tahu konteks "ini hasil reset password",
   * bukan sekadar "password diubah" -- beda konteks, beda action name,
   * jadi lebih tepat dicatat di caller). Sama seperti `createWithProfile`
   * di atas.
   */
  updatePassword(id: number, passwordHash: string) {
    return this.usersRepository.updatePassword(id, passwordHash);
  }

  /**
   * Admin membuat user baru langsung dari Users management -- beda
   * dari `AuthService.register()` (self-registration): tidak memicu
   * notifikasi Telegram ke admin (admin-lah yang melakukan aksi ini),
   * tapi tetap tercatat di audit log sebagai `user.create` dengan
   * admin yang membuat sebagai actor (bukan user barunya sendiri,
   * beda dari `auth.register` yang actor-nya user itu sendiri).
   */
  async create(dto: CreateUserDto, actor: AuditActor): Promise<SafeUser> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const passwordHash = await this.hashingService.hash(dto.password);
    const user = await this.usersRepository.createWithProfile({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
    });

    await this.auditLogService.record({
      action: 'user.create',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      resourceType: 'user',
      resourceId: user.id,
      metadata: { email: user.email },
    });

    return this.sanitize(user);
  }

  /**
   * Menonaktifkan user (reversibel lewat `reactivate()`). TIDAK perlu
   * cabut refresh token/invalidate cache permission secara manual di
   * sini -- `JwtStrategy.validate()` sudah query ulang `isActive` di
   * SETIAP request, dan `AuthService.refresh()` sudah menolak +
   * membersihkan sesi kalau user ternyata tidak aktif lagi (lihat
   * komentar "Edge case" di sana). Efeknya sudah instan tanpa modul
   * `users` perlu tahu apa-apa soal refresh token sama sekali --
   * menjaga `UsersModule` tetap tidak bergantung ke `AuthModule`
   * (kalau iya, akan circular: `AuthModule` sudah import `UsersModule`).
   */
  async suspend(id: number, actor: AuditActor): Promise<SafeUser> {
    const target = await this.findByIdOrThrow(id);
    if (target.id === actor.userId) {
      throw new ConflictException('Tidak bisa menonaktifkan akun sendiri');
    }

    const user = await this.usersRepository.updateStatus(id, false);

    await this.auditLogService.record({
      action: 'user.suspend',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      resourceType: 'user',
      resourceId: id,
      metadata: { email: target.email },
    });

    return this.sanitize(user);
  }

  async reactivate(id: number, actor: AuditActor): Promise<SafeUser> {
    // `findByIdOrThrow` (bukan `findActiveById`) SENGAJA -- justru
    // dipakai untuk user yang sedang tidak aktif. Tetap otomatis
    // menolak user yang sudah soft-deleted karena `findById` exclude
    // `deletedAt IS NOT NULL` (lihat UsersRepository.findById).
    const target = await this.findByIdOrThrow(id);

    const user = await this.usersRepository.updateStatus(id, true);

    await this.auditLogService.record({
      action: 'user.reactivate',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      resourceType: 'user',
      resourceId: id,
      metadata: { email: target.email },
    });

    return this.sanitize(user);
  }

  /**
   * Soft delete. Sama seperti `suspend()`, tidak perlu urus refresh
   * token/cache permission secara manual -- alasan sama, lihat
   * komentar di `suspend()`.
   */
  async delete(id: number, actor: AuditActor): Promise<void> {
    const target = await this.findByIdOrThrow(id);
    if (target.id === actor.userId) {
      throw new ConflictException('Tidak bisa menghapus akun sendiri');
    }

    await this.usersRepository.softDelete(id);

    await this.auditLogService.record({
      action: 'user.delete',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      resourceType: 'user',
      resourceId: id,
      metadata: { email: target.email },
    });
  }

  /** Strip `passwordHash` sebelum data user dikirim ke luar service layer. */
  sanitize(user: User): SafeUser {
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
