import './kv-mock.js';
import './pusher-mock.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetKvMock, kvMock } from './kv-mock';
import { resetBroadcasts, getBroadcasts } from './pusher-mock';
import type { NextRequest } from 'next/server';
import type { Room } from '../lib/rooms';

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => { cookieStore.set(name, value); },
  }),
}));

import { POST as createRoom } from '../app/api/rooms/route.js';
import { POST as startRoom } from '../app/api/rooms/[code]/start/route.js';
import { POST as leaveRoom } from '../app/api/rooms/[code]/leave/route.js';
import { POST as tickRoom } from '../app/api/rooms/[code]/tick/route.js';
import { GET as getSnapshot } from '../app/api/rooms/[code]/snapshot/route.js';

function mockReq(url: string, body?: unknown): NextRequest {
  return {
    url,
    formData: async () => new FormData(),
    json: async () => body ?? {},
  } as unknown as NextRequest;
}

const readRoom = (code: string) => kvMock.get(`room:${code}`) as Promise<Room | null>;
const eventBroadcasts = () => getBroadcasts().filter((b) => b.event === 's:event');
const lobbyBroadcasts = (code: string) =>
  getBroadcasts().filter((b) => b.channel === `private-room-${code}` && b.event === 's:lobby');

async function createAndStartSolo(): Promise<string> {
  cookieStore.set('playerId', 'hostA');
  const { roomCode } = await (await createRoom()).json();
  await startRoom(mockReq(`http://localhost/api/rooms/${roomCode}/start`), { params: { code: roomCode } });
  return roomCode;
}

describe('disconnect → bot takeover', () => {
  beforeEach(() => {
    resetKvMock();
    resetBroadcasts();
    cookieStore.clear();
  });

  it('POST /leave marks the player disconnected, starts the grace timer, pings the lobby', async () => {
    const code = await createAndStartSolo();
    resetBroadcasts();

    cookieStore.set('playerId', 'hostA');
    const res = await leaveRoom(mockReq(`http://localhost/api/rooms/${code}/leave`), { params: { code } });
    expect(res.status).toBe(204);

    const room = (await readRoom(code))!;
    const seat0 = room.seats[0];
    expect(seat0.kind).toBe('human');
    if (seat0.kind === 'human') {
      expect(seat0.connected).toBe(false);
      expect(typeof seat0.graceExpiresAt).toBe('number');
    }
    expect(lobbyBroadcasts(code).length).toBeGreaterThanOrEqual(1);
  });

  it('POST /tick is a cheap no-op (204) when nobody needs replacing', async () => {
    const code = await createAndStartSolo();
    resetBroadcasts();

    const res = await tickRoom(mockReq(`http://localhost/api/rooms/${code}/tick`), { params: { code } });
    expect(res.status).toBe(204);
    expect(eventBroadcasts().length).toBe(0);
  });

  it('a snapshot fetch by a present player clears a stale away-flag (refresh-race self-heal)', async () => {
    const code = await createAndStartSolo();

    // A late leave-beacon marked the host away even though they are still here.
    cookieStore.set('playerId', 'hostA');
    await leaveRoom(mockReq(`http://localhost/api/rooms/${code}/leave`), { params: { code } });
    let room = (await readRoom(code))!;
    expect(room.seats[0].kind === 'human' && room.seats[0].connected).toBe(false);

    // The host's client fetches a snapshot — that proves presence.
    const res = await getSnapshot(mockReq(`http://localhost/api/rooms/${code}/snapshot`), { params: { code } });
    expect(res.status).toBe(200);

    room = (await readRoom(code))!;
    expect(room.seats[0].kind === 'human' && room.seats[0].connected).toBe(true);
  });

  it('POST /tick swaps a grace-expired disconnected human for a bot and advances the hand', async () => {
    const code = await createAndStartSolo();

    // Host (the dealer on turn) disconnects, then their grace window expires.
    cookieStore.set('playerId', 'hostA');
    await leaveRoom(mockReq(`http://localhost/api/rooms/${code}/leave`), { params: { code } });
    const room = (await readRoom(code))!;
    const seat0 = room.seats[0];
    if (seat0.kind === 'human') seat0.graceExpiresAt = 1; // far in the past
    await kvMock.set(`room:${code}`, room);

    const seqBefore = (await readRoom(code))!.seq;
    resetBroadcasts();

    const res = await tickRoom(mockReq(`http://localhost/api/rooms/${code}/tick`), { params: { code } });
    expect(res.status).toBe(200);

    const after = (await readRoom(code))!;
    expect(after.seats[0].kind).toBe('bot');
    expect(after.seq).toBeGreaterThan(seqBefore);
    expect(eventBroadcasts().length).toBeGreaterThan(0);
  });
});
