import { createHash } from 'node:crypto';
import { hashToken } from './hash-token.util';

describe('hashToken', () => {
  it('menghasilkan SHA-256 hex yang sama dengan crypto native untuk input yang sama', () => {
    const raw = 'contoh-refresh-token-random-64-byte';
    const expected = createHash('sha256').update(raw).digest('hex');

    expect(hashToken(raw)).toBe(expected);
  });

  it('bersifat deterministik — input sama selalu hasil sama', () => {
    const raw = 'token-lain';
    expect(hashToken(raw)).toBe(hashToken(raw));
  });

  it('menghasilkan hash berbeda untuk input yang berbeda', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });

  it('selalu menghasilkan string hex 64 karakter (256 bit)', () => {
    const hash = hashToken('apa saja');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
