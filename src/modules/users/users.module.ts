import { Module } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { HashingModule } from '../../core/hashing/hashing.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  // HashingModule (buat create()) & AuditLogModule (buat semua aksi
  // admin) diimpor di sini, BUKAN di AuthModule -- arahnya harus tetap
  // UsersModule sebagai "downstream", jangan sampai UsersModule balik
  // butuh sesuatu dari AuthModule (lihat komentar di
  // UsersService.suspend() soal kenapa refresh token sengaja tidak
  // disentuh dari sini).
  imports: [HashingModule, AuditLogModule],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService],
  // Diexport karena AuthModule (dan nanti ProfileModule, RoleModule)
  // butuh akses ke data user.
  exports: [UsersService],
})
export class UsersModule {}
