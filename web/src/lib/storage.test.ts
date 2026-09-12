// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetStorageProbe, safeLocal, safeSession, storageAvailable } from '@/lib/storage';

/**
 * The sign-in screen reads a preference from storage while rendering. In private
 * windows and partitioned iframes that call throws, which used to take the whole
 * page to the error boundary — the "500" a user saw when they tried to sign in.
 * These tests hold that behaviour down.
 */
describe('safe storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetStorageProbe();
  });

  it('reads and writes normally when storage works', () => {
    safeLocal.set('k', 'v');
    expect(safeLocal.get('k')).toBe('v');
    safeLocal.remove('k');
    expect(safeLocal.get('k')).toBeNull();
  });

  it('survives a getter that throws (Safari private mode, partitioned iframe)', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    expect(() => safeLocal.get('anything')).not.toThrow();
    expect(safeLocal.get('anything')).toBeNull();
    expect(() => safeLocal.set('anything', '1')).not.toThrow();
    expect(safeLocal.get('anything')).toBe('1'); // served from the memory shadow
  });

  it('survives setItem throwing (quota / policy)', () => {
    const store = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
      removeItem: () => undefined,
    } as unknown as Storage;
    vi.spyOn(window, 'sessionStorage', 'get').mockReturnValue(store);
    __resetStorageProbe();

    expect(safeSession.set('a', 'b')).toBe(false);
    expect(safeSession.get('a')).toBe('b');
    expect(storageAvailable()).toBe(true);
  });

  it('parses JSON defensively', () => {
    safeLocal.set('json', '{not json');
    expect(safeLocal.getJson('json', { safe: true })).toEqual({ safe: true });
    safeLocal.setJson('json2', { a: 1 });
    expect(safeLocal.getJson('json2', {})).toEqual({ a: 1 });
  });
});
