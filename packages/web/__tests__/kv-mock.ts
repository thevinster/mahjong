import { vi } from 'vitest';

const store = new Map<string, { value: unknown; expires?: number }>();

export const kvMock = {
  get: vi.fn(async <T>(key: string): Promise<T | null> => {
    const e = store.get(key);
    if (!e) return null;
    if (e.expires && Date.now() > e.expires) { store.delete(key); return null; }
    return e.value as T;
  }),
  set: vi.fn(async (key: string, value: unknown, opts?: { ex?: number; nx?: boolean }) => {
    if (opts?.nx && store.has(key)) return null;
    const expires = opts?.ex ? Date.now() + opts.ex * 1000 : undefined;
    store.set(key, expires === undefined ? { value } : { value, expires });
    return 'OK';
  }),
  del: vi.fn(async (key: string) => { store.delete(key); return 1; }),
};

export function resetKvMock() {
  store.clear();
  kvMock.get.mockClear();
  kvMock.set.mockClear();
  kvMock.del.mockClear();
}

// Inject before any module that imports @vercel/kv
vi.mock('@vercel/kv', () => ({ kv: kvMock }));
