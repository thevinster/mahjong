import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../src/index.js';
import type { FastifyInstance } from 'fastify';

describe('REST: POST /api/rooms', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('creates a room and returns roomCode + playerId', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/rooms' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.roomCode).toMatch(/^[0-9A-Z]{4}$/);
    expect(body.playerId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('uses the playerId from cookie when present', async () => {
    app = await buildApp();
    const fixedId = '11111111-1111-1111-1111-111111111111';
    const res = await app.inject({
      method: 'POST', url: '/api/rooms',
      headers: { cookie: `playerId=${fixedId}` },
    });
    expect(res.json().playerId).toBe(fixedId);
  });
});

describe('REST: POST /api/rooms/:code/join', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('places joiner in next empty seat', async () => {
    app = await buildApp();
    const hostId = '11111111-1111-1111-1111-111111111111';
    const create = await app.inject({
      method: 'POST', url: '/api/rooms',
      headers: { cookie: `playerId=${hostId}` },
    });
    const { roomCode } = create.json();

    const guestId = '22222222-2222-2222-2222-222222222222';
    const join = await app.inject({
      method: 'POST', url: `/api/rooms/${roomCode}/join`,
      payload: { displayName: 'Alice' },
      headers: { cookie: `playerId=${guestId}` },
    });
    expect(join.statusCode).toBe(200);
    expect(join.json()).toEqual({ seat: 1 });
  });

  it('returns 404 for unknown room', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/rooms/ZZZZ/join',
      payload: { displayName: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when room full', async () => {
    app = await buildApp();
    const c = await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: 'playerId=h' } });
    const { roomCode } = c.json();
    for (const id of ['a','b','c']) {
      await app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/join`, payload: { displayName: id }, headers: { cookie: `playerId=${id}` } });
    }
    const fourth = await app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/join`, payload: { displayName: 'd' }, headers: { cookie: 'playerId=d' } });
    expect(fourth.statusCode).toBe(409);
  });
});

describe('REST: POST /api/rooms/:code/start', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('host can start the room (200) — fills bots and creates engine state', async () => {
    app = await buildApp();
    const hostId = '99999999-9999-9999-9999-999999999999';
    const c = await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: `playerId=${hostId}` } });
    const { roomCode } = c.json();
    const start = await app.inject({
      method: 'POST', url: `/api/rooms/${roomCode}/start`,
      headers: { cookie: `playerId=${hostId}` },
    });
    expect(start.statusCode).toBe(204);
    // The room should now have engine state and 3 bots filled
    const rooms = (app as unknown as { rooms: import('../src/rooms.js').RoomRegistry }).rooms;
    const room = rooms.get(roomCode)!;
    expect(room.state).not.toBeNull();
    expect(room.phase).toBe('playing');
    expect(room.seats[1].kind).toBe('bot');
    expect(room.seats[2].kind).toBe('bot');
    expect(room.seats[3].kind).toBe('bot');
  });

  it('non-host gets 403', async () => {
    app = await buildApp();
    const c = await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: 'playerId=host' } });
    const { roomCode } = c.json();
    const start = await app.inject({
      method: 'POST', url: `/api/rooms/${roomCode}/start`,
      headers: { cookie: 'playerId=guest' },
    });
    expect(start.statusCode).toBe(403);
  });
});

describe('REST: GET /api/rooms/:code/snapshot', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('returns redacted snapshot for a seated player', async () => {
    app = await buildApp();
    const c = await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: 'playerId=h' } });
    const { roomCode } = c.json();
    await app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/start`, headers: { cookie: 'playerId=h' } });

    const snap = await app.inject({
      method: 'GET', url: `/api/rooms/${roomCode}/snapshot`,
      headers: { cookie: 'playerId=h' },
    });
    expect(snap.statusCode).toBe(200);
    const body = snap.json();
    expect(body.viewer).toBe(0);
    expect(body.hands).toBeDefined();
  });

  it('returns 403 for a non-seated player', async () => {
    app = await buildApp();
    const c = await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: 'playerId=h' } });
    const { roomCode } = c.json();
    await app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/start`, headers: { cookie: 'playerId=h' } });
    const snap = await app.inject({
      method: 'GET', url: `/api/rooms/${roomCode}/snapshot`,
      headers: { cookie: 'playerId=interloper' },
    });
    expect(snap.statusCode).toBe(403);
  });
});
