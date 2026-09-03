import { Injectable } from '@nestjs/common';
import {
  CreateUserWithProfileInput,
  UsersRepository,
} from './users.repository';
import { User } from '../../database/schema';
import { SafeUser } from './types/safe-user.type';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findByEmail(email: string) {
    return this.usersRepository.findByEmail(email);
  }

  findActiveById(id: number) {
    return this.usersRepository.findActiveById(id);
  }

  createWithProfile(input: CreateUserWithProfileInput) {
    return this.usersRepository.createWithProfile(input);
  }

  /** Strip `passwordHash` sebelum data user dikirim ke luar service layer. */
  sanitize(user: User): SafeUser {
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
