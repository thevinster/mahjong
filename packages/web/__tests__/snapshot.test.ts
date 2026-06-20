import './kv-mock.js';
import './pusher-mock.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetKvMock } from './kv-mock';
import { resetBroadcasts } from './pusher-mock';
import { initialState, seededRng } from '@mahjong/engine';
import type { NextRequest } from 'next/server';
import type { Room } from '../lib/rooms';
import { buildRoomSnapshot } from '../lib/snapshot';

// Shared cookie jar so we can simulate distinct players across calls.
const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => { cookieStore.set(name, value); },
  }),
}));

import { POST as createRoom } from '../app/api/rooms/route.js';
import { POST as startRoom } from '../app/api/rooms/[code]/start/route.js';
import { POST as sendIntent } from '../app/api/rooms/[code]/intent/route.js';
import { GET as getSnapshot } from '../app/api/rooms/[code]/snapshot/route.js';

function mockReq(url: string, body?: unknown): NextRequest {
  return {
    url,
    formData: async () => new FormData(),
    json: async () => body ?? {},
  } as unknown as NextRequest;
}

function makeRoom(overrides: Partial<Room>): Room {
  return {
    code: 'TEST',
    createdAt: 0,
    host: 'host',
    seats: {
      0: { kind: 'human', playerId: 'host', displayName: 'Alice', connected: true },
      1: { kind: 'bot', policyName: 'heuristic' },
      2: { kind: 'empty' },
      3: { kind: 'human', playerId: 'p3', displayName: 'Dora', connected: false, graceExpiresAt: 123 },
    },
    state: null,
    phase: 'lobby',
    endedAt: null,
    seq: 0,
    pendingClaims: {},
    version: 1,
    ...overrides,
  };
}

describe('buildRoomSnapshot (unit)', () => {
  it('exposes a public roster without leaking playerIds', () => {
    const snap = buildRoomSnapshot(makeRoom({}), 'host');
    expect(snap.seats).toHaveLength(4);
    expect(snap.seats[0]).toMatchObject({ seat: 0, kind: 'human', name: 'Alice', connected: true });
    expect(snap.seats[1]).toMatchObject({ seat: 1, kind: 'bot', connected: false });
    expect(snap.seats[2]).toMatchObject({ seat: 2, kind: 'empty', name: null, connected: false });
    expect(snap.seats[3]).toMatchObject({ seat: 3, kind: 'human', name: 'Dora', connected: false });
    // No playerId field anywhere in the serialized roster.
    expect(JSON.stringify(snap.seats)).not.toContain('playerId');
    expect(JSON.stringify(snap.seats)).not.toContain('"host"');
  });

  it('reports viewerSeat + isHost for the viewer', () => {
    const room = makeRoom({});
    expect(buildRoomSnapshot(room, 'host')).toMatchObject({ viewerSeat: 0, isHost: true });
    expect(buildRoomSnapshot(room, 'p3')).toMatchObject({ viewerSeat: 3, isHost: false });
    expect(buildRoomSnapshot(room, 'stranger')).toMatchObject({ viewerSeat: null, isHost: false });
  });

  it('omits game state in the lobby', () => {
    const snap = buildRoomSnapshot(makeRoom({}), 'host');
    expect(snap.phase).toBe('lobby');
    expect(snap.state).toBeNull();
  });

  it('attaches per-seat redacted state only for a seated viewer mid-game', () => {
    const state = initialState(seededRng(1));
    const room = makeRoom({ state, phase: 'playing' });
    const seated = buildRoomSnapshot(room, 'host');
    expect(seated.phase).toBe('playing');
    expect(seated.state).not.toBeNull();
    expect(seated.state!.viewer).toBe(0);
    // Non-seated viewer gets the roster but no redacted hand state.
    const stranger = buildRoomSnapshot(room, 'stranger');
    expect(stranger.viewerSeat).toBeNull();
    expect(stranger.state).toBeNull();
  });
});

describe('GET /snapshot route', () => {
  beforeEach(() => {
    resetKvMock();
    resetBroadcasts();
    cookieStore.clear();
  });

  async function freshRoom(): Promise<string> {
    cookieStore.set('playerId', 'hostA');
    const res = await createRoom();
    const { roomCode } = await res.json();
    return roomCode;
  }

  it('returns a 200 lobby snapshot for the host before the hand starts', async () => {
    const code = await freshRoom();
    const res = await getSnapshot(mockReq(`http://localhost/api/rooms/${code}/snapshot`), { params: { code } });
    expect(res.status).toBe(200);
    const snap = await res.json();
    expect(snap.phase).toBe('lobby');
    expect(snap.viewerSeat).toBe(0);
    expect(snap.isHost).toBe(true);
    expect(snap.state).toBeNull();
    expect(snap.seats[0].kind).toBe('human');
    expect(snap.seats[1].kind).toBe('empty');
  });

  it('does not 403 a non-seated visitor in the lobby', async () => {
    const code = await freshRoom();
    cookieStore.set('playerId', 'strangerX');
    const res = await getSnapshot(mockReq(`http://localhost/api/rooms/${code}/snapshot`), { params: { code } });
    expect(res.status).toBe(200);
    const snap = await res.json();
    expect(snap.viewerSeat).toBeNull();
    expect(snap.seats).toHaveLength(4);
  });

  it('exposes redacted game state once the hand starts and advances after a discard', async () => {
    const code = await freshRoom();
    await startRoom(mockReq(`http://localhost/api/rooms/${code}/start`), { params: { code } });

    const before = await (await getSnapshot(mockReq(`http://localhost/api/rooms/${code}/snapshot`), { params: { code } })).json();
    expect(before.phase).toBe('playing');
    expect(before.state).not.toBeNull();
    expect(before.state.phase.t).toBe('awaitDiscard');
    expect(before.viewerSeat).toBe(0);

    const hand = before.state.hands[0];
    expect(hand.own).toBe(true);
    const tile = hand.concealed[0];
    const intentRes = await sendIntent(
      mockReq(`http://localhost/api/rooms/${code}/intent`, { intent: { t: 'discard', seat: 0, tile } }),
      { params: { code } },
    );
    expect(intentRes.status).toBe(200);

    const after = await (await getSnapshot(mockReq(`http://localhost/api/rooms/${code}/snapshot`), { params: { code } })).json();
    expect(after.state.discards.length).toBeGreaterThan(before.state.discards.length);
  });
});
