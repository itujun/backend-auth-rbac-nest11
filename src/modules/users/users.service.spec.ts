import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { HashingService } from '../../core/hashing/hashing.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { FindUsersQueryDto } from './dto/find-users-query.dto';
import type { User } from '../../database/schema';

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: 'budi@example.com',
    passwordHash: 'hashed:secret',
    isActive: true,
    emailVerifiedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

function createService() {
  const findAllMock = jest.fn();
  const findByEmailMock = jest.fn();
  const findActiveByIdMock = jest.fn();
  const findByIdMock = jest.fn();
  const createWithProfileMock = jest.fn();
  const updateStatusMock = jest.fn();
  const softDeleteMock = jest.fn();
  const updatePasswordMock = jest.fn();
  const repository = {
    findAll: findAllMock,
    findByEmail: findByEmailMock,
    findActiveById: findActiveByIdMock,
    findById: findByIdMock,
    createWithProfile: createWithProfileMock,
    updateStatus: updateStatusMock,
    softDelete: softDeleteMock,
    updatePassword: updatePasswordMock,
  } as unknown as UsersRepository;

  const hashMock = jest.fn().mockResolvedValue('hashed:secret');
  const hashingService = { hash: hashMock } as unknown as HashingService;

  const recordMock = jest.fn().mockResolvedValue(undefined);
  const auditLogService = { record: recordMock } as unknown as AuditLogService;

  const service = new UsersService(repository, hashingService, auditLogService);

  return {
    service,
    findAllMock,
    findByEmailMock,
    findActiveByIdMock,
    findByIdMock,
    createWithProfileMock,
    updateStatusMock,
    softDeleteMock,
    updatePasswordMock,
    hashMock,
    recordMock,
  };
}

describe('UsersService', () => {
  // 4 method ini murni delegasi 1-baris ke repository — cukup dites
  // "argumen diteruskan apa adanya & hasil repository diteruskan balik",
  // TANPA menguji ulang logic query-nya (itu tanggung jawab e2e test
  // terhadap DB sungguhan, bukan unit test service dengan repo di-mock).
  it('findAll() meneruskan query ke repository apa adanya', () => {
    const { service, findAllMock } = createService();
    const query: FindUsersQueryDto = {
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    };
    findAllMock.mockReturnValue('hasil-paginasi');

    const result = service.findAll(query);

    expect(findAllMock).toHaveBeenCalledWith(query);
    expect(result).toBe('hasil-paginasi');
  });

  it('findByEmail() meneruskan email ke repository apa adanya', () => {
    const { service, findByEmailMock } = createService();
    findByEmailMock.mockReturnValue('hasil');

    const result = service.findByEmail('budi@example.com');

    expect(findByEmailMock).toHaveBeenCalledWith('budi@example.com');
    expect(result).toBe('hasil');
  });

  it('findActiveById() meneruskan id ke repository apa adanya', () => {
    const { service, findActiveByIdMock } = createService();
    findActiveByIdMock.mockReturnValue('hasil');

    const result = service.findActiveById(7);

    expect(findActiveByIdMock).toHaveBeenCalledWith(7);
    expect(result).toBe('hasil');
  });

  it('findById() meneruskan id ke repository apa adanya', () => {
    const { service, findByIdMock } = createService();
    findByIdMock.mockReturnValue('hasil');

    const result = service.findById(7);

    expect(findByIdMock).toHaveBeenCalledWith(7);
    expect(result).toBe('hasil');
  });

  it('createWithProfile() meneruskan input ke repository apa adanya', () => {
    const { service, createWithProfileMock } = createService();
    const input = { email: 'x@example.com', passwordHash: 'h' };
    createWithProfileMock.mockReturnValue('hasil');

    const result = service.createWithProfile(input);

    expect(createWithProfileMock).toHaveBeenCalledWith(input);
    expect(result).toBe('hasil');
  });

  describe('sanitize', () => {
    it('menghapus passwordHash tapi mempertahankan field lain', () => {
      const { service } = createService();
      const user = fakeUser();

      const result = service.sanitize(user);

      expect(result).not.toHaveProperty('passwordHash');
      expect(result).toEqual({
        id: user.id,
        email: user.email,
        isActive: user.isActive,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        deletedAt: user.deletedAt,
      });
    });

    it('tidak memodifikasi objek User asli (pure function)', () => {
      const { service } = createService();
      const user = fakeUser();

      service.sanitize(user);

      expect(user).toHaveProperty('passwordHash');
    });
  });
});
