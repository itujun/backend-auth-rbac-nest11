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

  /** Strip `passwordHash` sebelum data user dikirim ke luar service layer. */
  sanitize(user: User): SafeUser {
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
