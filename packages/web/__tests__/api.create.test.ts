import './kv-mock.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { resetKvMock } from './kv-mock.js';
import { POST } from '../app/api/rooms/route.js';
import { vi } from 'vitest';

vi.mock('next/headers', () => {
  const store = new Map<string, string>();
  return {
    cookies: () => ({
      get: (name: string) => store.has(name) ? { name, value: store.get(name)! } : undefined,
      set: (name: string, value: string) => { store.set(name, value); },
    }),
  };
});

describe('POST /api/rooms', () => {
  beforeEach(() => resetKvMock());

  it('creates a room and returns roomCode + playerId', async () => {
    const res = await POST();
    const body = await res.json();
    expect(body.roomCode).toMatch(/^[2-9A-Z]{4}$/);
    expect(body.playerId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
