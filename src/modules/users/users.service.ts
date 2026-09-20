import { Injectable } from '@nestjs/common';
import {
  CreateUserWithProfileInput,
  UsersRepository,
} from './users.repository';
import { User } from '../../database/schema';
import { SafeUser } from './types/safe-user.type';
import { FindUsersQueryDto } from './dto/find-users-query.dto';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

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

  /** Strip `passwordHash` sebelum data user dikirim ke luar service layer. */
  sanitize(user: User): SafeUser {
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
