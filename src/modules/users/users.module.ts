import { Module } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  providers: [UsersRepository, UsersService],
  // Diexport karena AuthModule (dan nanti ProfileModule, RoleModule)
  // butuh akses ke data user.
  exports: [UsersService],
})
export class UsersModule {}
