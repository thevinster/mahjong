import './kv-mock.js';
import './pusher-mock.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetKvMock } from './kv-mock';
import { resetBroadcasts, getBroadcasts } from './pusher-mock';
import type { NextRequest } from 'next/server';

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => { cookieStore.set(name, value); },
  }),
}));

import { POST as createRoom } from '../app/api/rooms/route.js';
import { POST as joinRoom } from '../app/api/rooms/[code]/join/route.js';
import { POST as startRoom } from '../app/api/rooms/[code]/start/route.js';

function mockReq(url: string, body?: unknown): NextRequest {
  return {
    url,
    formData: async () => new FormData(),
    json: async () => body ?? {},
  } as unknown as NextRequest;
}

function lobbyBroadcasts(code: string) {
  return getBroadcasts().filter((b) => b.channel === `private-room-${code}` && b.event === 's:lobby');
}

describe('lobby realtime', () => {
  beforeEach(() => {
    resetKvMock();
    resetBroadcasts();
    cookieStore.clear();
  });

  async function createAsHost(): Promise<string> {
    cookieStore.set('playerId', 'hostA');
    const res = await createRoom();
    const { roomCode } = await res.json();
    return roomCode;
  }

  it('seats a second human and broadcasts a lobby update on join', async () => {
    const code = await createAsHost();
    resetBroadcasts();

    cookieStore.set('playerId', 'playerB');
    const res = await joinRoom(
      mockReq(`http://localhost/api/rooms/${code}/join`, { displayName: 'Bob' }),
      { params: { code } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.seat).toBe(1);
    expect(lobbyBroadcasts(code).length).toBeGreaterThanOrEqual(1);
  });

  it('broadcasts a lobby update when the host starts (even with no leading bot events)', async () => {
    const code = await createAsHost();
    resetBroadcasts();

    const res = await startRoom(mockReq(`http://localhost/api/rooms/${code}/start`), { params: { code } });
    expect(res.status).toBe(204);
    expect(lobbyBroadcasts(code).length).toBeGreaterThanOrEqual(1);
  });
});
