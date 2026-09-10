import { resolveRequestId } from './logger.config';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('resolveRequestId', () => {
  it('memakai ulang header X-Request-Id yang valid dari upstream (propagasi lintas service)', () => {
    const result = resolveRequestId('order-service-abc123');

    expect(result).toBe('order-service-abc123');
  });

  it('generate UUID v4 baru kalau tidak ada header sama sekali', () => {
    const result = resolveRequestId(undefined);

    expect(result).toMatch(UUID_PATTERN);
  });

  it('generate UUID v4 baru kalau header ada tapi array (duplikat header) -- bukan string tunggal', () => {
    const result = resolveRequestId(['id-1', 'id-2']);

    expect(result).toMatch(UUID_PATTERN);
  });

  it('generate UUID v4 baru kalau header kosong', () => {
    const result = resolveRequestId('');

    expect(result).toMatch(UUID_PATTERN);
  });

  it('generate UUID v4 baru kalau header kepanjangan (>64 karakter) -- proteksi dari log yang membengkak', () => {
    const result = resolveRequestId('a'.repeat(65));

    expect(result).toMatch(UUID_PATTERN);
  });

  it('MENGIZINKAN header persis 64 karakter (batas atas)', () => {
    const exactly64 = 'a'.repeat(64);

    const result = resolveRequestId(exactly64);

    expect(result).toBe(exactly64);
  });

  it('generate UUID v4 baru kalau header mengandung karakter di luar whitelist (mis. newline/kutip -- proteksi dari log injection)', () => {
    const result = resolveRequestId('id-with-"quote"-and\nnewline');

    expect(result).toMatch(UUID_PATTERN);
  });

  it('setiap panggilan tanpa header menghasilkan ID yang BERBEDA (bukan konstanta yang ke-cache)', () => {
    const first = resolveRequestId(undefined);
    const second = resolveRequestId(undefined);

    expect(first).not.toBe(second);
  });
});
