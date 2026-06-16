# Mahjong Server Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `server` package — Fastify HTTP server + Socket.IO real-time
layer + in-memory room registry + identity/reconnect + bot scheduler + Fly.io
deploy config. End state: a public `<app>.fly.dev` URL where the host creates
rooms and friends join with a 4-char code, scripted hands complete end-to-end
over real WebSockets, and bots fill any empty seats.

**Architecture:** Single Node 20+ process. Fastify serves REST endpoints + the
built client static files; Socket.IO handles all in-game messages. The server
is the SOLE authoritative writer of `GameState` — clients submit intents, the
server validates against the engine's `legalIntents`, runs `step`, and
broadcasts events (per-seat redacted). All state in memory; restart drops
rooms (acceptable: single-hand rooms). Deploys as one container to Fly.io.

**Tech Stack:** Node 20+, pnpm 9+, TypeScript 5.4+ (strict), Fastify 4+,
@fastify/cookie 9+, @fastify/static 6+, Socket.IO 4+, vitest 1.6+,
socket.io-client 4+ for integration tests. `@mahjong/engine` from the workspace.

**Dev-server environment note:** On the Meta Linux dev server, before any
`node`/`npm`/`pnpm`/`npx` command, source the helper:
```bash
source /home/leevince/mahjong/scripts/dev-env.sh
```
Invoke pnpm via `npx --yes pnpm@9.0.0 <args>`. On macOS this is unnecessary —
`brew install node pnpm` gives you the right tools on PATH.

**Scope of this plan:** Server package + deploy config only. The client
(Plan 3) is a separate package; this plan creates a tiny placeholder under
`packages/client/dist/` so static serving has something to point at.

---

## File map

Files created/modified by this plan:

```
mahjong/
  packages/server/
    package.json
    tsconfig.json
    vitest.config.ts
    src/
      index.ts                     # bootstrap: Fastify + Socket.IO + listen
      env.ts                       # PORT, HOST, NODE_ENV
      identity.ts                  # playerId cookie + getOrIssuePlayerId
      codes.ts                     # generateRoomCode, RESERVED_PREFIX
      rooms.ts                     # Room type, RoomRegistry class
      bot-scheduler.ts             # maybeRunBotTurns + jitter
      protocol.ts                  # wire message types (c:* and s:*)
      dispatcher.ts                # applyIntent (the only mutation path)
      socket.ts                    # Socket.IO handlers (hello, intent)
      rest.ts                      # REST routes (POST create/join/start, GET snapshot)
      static.ts                    # serve packages/client/dist if it exists
      redact.ts                    # broadcastRedacted helper
      grace.ts                     # disconnect grace timer + bot takeover
    tests/
      identity.test.ts
      codes.test.ts
      rooms.test.ts
      dispatcher.test.ts
      integration/
        happy-path.test.ts
        reconnect.test.ts
        illegal-intents.test.ts
  packages/client/dist/
    index.html                     # placeholder served until Plan 3
  Dockerfile                       # multi-stage: build engine + server, run server
  fly.toml                         # Fly.io app config
  .dockerignore
  docs/
    DEPLOY.md                      # short ops doc
```

---

## Task 1: Server package scaffold + Fastify boot

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/vitest.config.ts`
- Create: `packages/server/src/env.ts`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/tests/boot.test.ts`

- [ ] **Step 1: Write `packages/server/package.json`**

```json
{
  "name": "@mahjong/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "build": "tsc -b",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@fastify/cookie": "^9.3.1",
    "@fastify/static": "^7.0.1",
    "@mahjong/engine": "workspace:*",
    "fastify": "^4.26.2",
    "socket.io": "^4.7.5"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "socket.io-client": "^4.7.5",
    "tsx": "^4.7.1",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Write `packages/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "composite": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["tests/**/*"],
  "references": [{ "path": "../engine" }]
}
```

- [ ] **Step 3: Write `packages/server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10_000,
  },
});
```

- [ ] **Step 4: Write `packages/server/src/env.ts`**

```ts
export const PORT = Number(process.env.PORT ?? 3000);
export const HOST = process.env.HOST ?? '0.0.0.0';
export const NODE_ENV = process.env.NODE_ENV ?? 'development';
export const COOKIE_SECRET = process.env.COOKIE_SECRET ?? 'dev-secret-do-not-use-in-prod';
```

- [ ] **Step 5: Write minimal `packages/server/src/index.ts`**

```ts
import Fastify from 'fastify';
import { PORT, HOST } from './env.js';

export async function buildApp() {
  const app = Fastify({ logger: false });
  app.get('/healthz', async () => ({ ok: true }));
  return app;
}

export async function start() {
  const app = await buildApp();
  await app.listen({ port: PORT, host: HOST });
  console.log(`mahjong server listening on http://${HOST}:${PORT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 6: Write `packages/server/tests/boot.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../src/index.js';
import type { FastifyInstance } from 'fastify';

describe('server boot', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('responds 200 OK to /healthz', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 7: Install and run**

```bash
source /home/leevince/mahjong/scripts/dev-env.sh && cd /home/leevince/mahjong && npx --yes pnpm@9.0.0 install
source /home/leevince/mahjong/scripts/dev-env.sh && cd /home/leevince/mahjong && npx --yes pnpm@9.0.0 --filter @mahjong/server test
```

Expected: 1 test passes.

- [ ] **Step 8: Commit**

```bash
cd /home/leevince/mahjong
git add packages/server pnpm-lock.yaml
git commit -m "server: scaffold Fastify package with healthz boot test"
```

---

## Task 2: Identity (playerId cookie)

**Files:**
- Create: `packages/server/src/identity.ts`
- Create: `packages/server/tests/identity.test.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Write failing test `packages/server/tests/identity.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../src/index.js';
import type { FastifyInstance } from 'fastify';

describe('identity cookie', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('issues a playerId cookie on first request and reuses it on second', async () => {
    app = await buildApp();
    const r1 = await app.inject({ method: 'GET', url: '/healthz' });
    const setCookie = r1.headers['set-cookie'];
    expect(setCookie).toBeTruthy();
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0]! : setCookie!;
    const match = cookieHeader.match(/playerId=([^;]+)/);
    expect(match).toBeTruthy();
    const id1 = match![1]!;
    expect(id1).toMatch(/^[0-9a-f-]{36}$/);

    const r2 = await app.inject({
      method: 'GET', url: '/healthz',
      headers: { cookie: `playerId=${id1}` },
    });
    // No new cookie issued when one is presented
    expect(r2.headers['set-cookie']).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `playerId` cookie not issued.

```bash
source /home/leevince/mahjong/scripts/dev-env.sh && cd /home/leevince/mahjong && npx --yes pnpm@9.0.0 --filter @mahjong/server test
```

- [ ] **Step 3: Implement `packages/server/src/identity.ts`**

```ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import { randomUUID } from 'node:crypto';
import { COOKIE_SECRET, NODE_ENV } from './env.js';

export const PLAYER_COOKIE = 'playerId';

export async function registerIdentity(app: FastifyInstance) {
  await app.register(cookie, { secret: COOKIE_SECRET });
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const existing = req.cookies[PLAYER_COOKIE];
    if (existing) {
      (req as FastifyRequest & { playerId: string }).playerId = existing;
      return;
    }
    const id = randomUUID();
    reply.setCookie(PLAYER_COOKIE, id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 365,
    });
    (req as FastifyRequest & { playerId: string }).playerId = id;
  });
}

export function getPlayerId(req: FastifyRequest): string {
  return (req as FastifyRequest & { playerId: string }).playerId;
}
```

- [ ] **Step 4: Wire it into `buildApp` in `packages/server/src/index.ts`**

Replace the body of `buildApp`:

```ts
import Fastify from 'fastify';
import { PORT, HOST } from './env.js';
import { registerIdentity } from './identity.js';

export async function buildApp() {
  const app = Fastify({ logger: false });
  await registerIdentity(app);
  app.get('/healthz', async () => ({ ok: true }));
  return app;
}
// ...rest unchanged
```

- [ ] **Step 5: Run, verify PASS**

Expected: identity test passes, boot test still passes.

- [ ] **Step 6: Commit**

```bash
cd /home/leevince/mahjong
git add packages/server pnpm-lock.yaml
git commit -m "server: playerId cookie identity hook"
```

---

## Task 3: Room code generator

**Files:**
- Create: `packages/server/src/codes.ts`
- Create: `packages/server/tests/codes.test.ts`

- [ ] **Step 1: Write failing test `packages/server/tests/codes.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { generateRoomCode, ROOM_CODE_ALPHABET } from '../src/codes.js';

describe('generateRoomCode', () => {
  it('returns a 4-char string from the alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(4);
      for (const ch of code) expect(ROOM_CODE_ALPHABET.includes(ch)).toBe(true);
    }
  });

  it('alphabet excludes 0/O/1/I (visually ambiguous)', () => {
    expect(ROOM_CODE_ALPHABET.includes('0')).toBe(false);
    expect(ROOM_CODE_ALPHABET.includes('O')).toBe(false);
    expect(ROOM_CODE_ALPHABET.includes('1')).toBe(false);
    expect(ROOM_CODE_ALPHABET.includes('I')).toBe(false);
  });

  it('produces varied codes across many draws', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) codes.add(generateRoomCode());
    expect(codes.size).toBeGreaterThan(50); // not all the same
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `codes.js` not found.

- [ ] **Step 3: Implement `packages/server/src/codes.ts`**

```ts
import { randomBytes } from 'node:crypto';

export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32 chars

export function generateRoomCode(): string {
  const bytes = randomBytes(4);
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += ROOM_CODE_ALPHABET[bytes[i]! & 0x1f];
  }
  return out;
}
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Commit**

```bash
cd /home/leevince/mahjong
git add packages/server/src/codes.ts packages/server/tests/codes.test.ts
git commit -m "server: room code generator (4 chars, unambiguous alphabet)"
```

---

## Task 4: Room registry

**Files:**
- Create: `packages/server/src/rooms.ts`
- Create: `packages/server/tests/rooms.test.ts`

- [ ] **Step 1: Write failing tests `packages/server/tests/rooms.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { RoomRegistry } from '../src/rooms.js';

describe('RoomRegistry', () => {
  it('create() returns a Room with a unique code and host playerId set', () => {
    const reg = new RoomRegistry();
    const r1 = reg.create('p1');
    const r2 = reg.create('p2');
    expect(r1.code).not.toBe(r2.code);
    expect(r1.host).toBe('p1');
    expect(r2.host).toBe('p2');
  });

  it('get() returns a created room and undefined for unknown code', () => {
    const reg = new RoomRegistry();
    const r = reg.create('p1');
    expect(reg.get(r.code)).toBe(r);
    expect(reg.get('ZZZZ')).toBeUndefined();
  });

  it('initializes seats with seat 0 = host (human), others = empty', () => {
    const reg = new RoomRegistry();
    const r = reg.create('p1');
    expect(r.seats[0]).toEqual({ kind: 'human', playerId: 'p1', displayName: 'Player 1', connected: true });
    expect(r.seats[1]).toEqual({ kind: 'empty' });
    expect(r.seats[2]).toEqual({ kind: 'empty' });
    expect(r.seats[3]).toEqual({ kind: 'empty' });
  });

  it('joinAsHuman() places the player in the first empty seat', () => {
    const reg = new RoomRegistry();
    const r = reg.create('p1');
    const seat = reg.joinAsHuman(r.code, 'p2', 'Alice');
    expect(seat).toBe(1);
    expect(r.seats[1]).toEqual({ kind: 'human', playerId: 'p2', displayName: 'Alice', connected: true });
  });

  it('joinAsHuman() rejects when room full', () => {
    const reg = new RoomRegistry();
    const r = reg.create('p1');
    reg.joinAsHuman(r.code, 'p2', 'A');
    reg.joinAsHuman(r.code, 'p3', 'B');
    reg.joinAsHuman(r.code, 'p4', 'C');
    expect(() => reg.joinAsHuman(r.code, 'p5', 'D')).toThrow(/full/i);
  });

  it('joinAsHuman() rejects re-join with different name (same playerId returns existing seat)', () => {
    const reg = new RoomRegistry();
    const r = reg.create('p1');
    reg.joinAsHuman(r.code, 'p2', 'Alice');
    const seatAgain = reg.joinAsHuman(r.code, 'p2', 'Alice'); // idempotent
    expect(seatAgain).toBe(1);
  });

  it('reap() removes the room', () => {
    const reg = new RoomRegistry();
    const r = reg.create('p1');
    reg.reap(r.code);
    expect(reg.get(r.code)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement `packages/server/src/rooms.ts`**

```ts
import type { GameState, BotPolicy, Seat } from '@mahjong/engine';
import { generateRoomCode } from './codes.js';

export type PlayerId = string;

export type SeatBinding =
  | { kind: 'empty' }
  | { kind: 'human'; playerId: PlayerId; displayName: string; connected: boolean }
  | { kind: 'bot';   policyName: string };

export type RoomPhase = 'lobby' | 'playing' | 'ended';

export type Room = {
  readonly code: string;
  readonly createdAt: number;
  readonly host: PlayerId;
  seats: Record<Seat, SeatBinding>;
  state: GameState | null;
  policies: Record<Seat, BotPolicy | null>;
  graceTimers: Record<Seat, NodeJS.Timeout | null>;
  phase: RoomPhase;
  endedAt: number | null;
  /** monotonic per-room event sequence number for s:event */
  seq: number;
  /** seat -> latest pending intent during awaitClaims (claim or pass) */
  pendingClaims: Map<Seat, unknown>;
};

export class RoomRegistry {
  private rooms = new Map<string, Room>();

  create(hostPlayerId: PlayerId): Room {
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();
    const room: Room = {
      code,
      createdAt: Date.now(),
      host: hostPlayerId,
      seats: {
        0: { kind: 'human', playerId: hostPlayerId, displayName: 'Player 1', connected: true },
        1: { kind: 'empty' },
        2: { kind: 'empty' },
        3: { kind: 'empty' },
      },
      state: null,
      policies: { 0: null, 1: null, 2: null, 3: null },
      graceTimers: { 0: null, 1: null, 2: null, 3: null },
      phase: 'lobby',
      endedAt: null,
      seq: 0,
      pendingClaims: new Map(),
    };
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /**
   * Place a human in the first empty seat. Idempotent: if the playerId is
   * already seated, returns the existing seat without modification.
   * Throws if room is full and player isn't already in it.
   */
  joinAsHuman(code: string, playerId: PlayerId, displayName: string): Seat {
    const room = this.rooms.get(code);
    if (!room) throw new Error(`room ${code} not found`);
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const b = room.seats[seat];
      if (b.kind === 'human' && b.playerId === playerId) {
        b.connected = true;
        return seat;
      }
    }
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const b = room.seats[seat];
      if (b.kind === 'empty') {
        room.seats[seat] = { kind: 'human', playerId, displayName, connected: true };
        return seat;
      }
    }
    throw new Error(`room ${code} is full`);
  }

  reap(code: string): void {
    const room = this.rooms.get(code);
    if (room) {
      for (const seat of [0, 1, 2, 3] as Seat[]) {
        const t = room.graceTimers[seat];
        if (t) clearTimeout(t);
      }
    }
    this.rooms.delete(code);
  }

  size(): number { return this.rooms.size; }
}
```

(Note: pendingClaims `unknown` will be tightened in Task 9 when the protocol types exist.)

- [ ] **Step 4: Run, verify PASS** (all room tests)

- [ ] **Step 5: Commit**

```bash
cd /home/leevince/mahjong
git add packages/server/src/rooms.ts packages/server/tests/rooms.test.ts
git commit -m "server: room registry with seat binding and code generation"
```

---

## Task 5: REST — create room

**Files:**
- Create: `packages/server/src/rest.ts`
- Create: `packages/server/tests/rest.test.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Write failing test `packages/server/tests/rest.test.ts`**

```ts
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
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement `packages/server/src/rest.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { getPlayerId } from './identity.js';
import { RoomRegistry } from './rooms.js';

export function registerRest(app: FastifyInstance, rooms: RoomRegistry) {
  app.post('/api/rooms', async (req) => {
    const playerId = getPlayerId(req);
    const room = rooms.create(playerId);
    return { roomCode: room.code, playerId };
  });
}
```

- [ ] **Step 4: Wire it into `buildApp` in `packages/server/src/index.ts`**

```ts
import Fastify from 'fastify';
import { PORT, HOST } from './env.js';
import { registerIdentity } from './identity.js';
import { registerRest } from './rest.js';
import { RoomRegistry } from './rooms.js';

export async function buildApp() {
  const app = Fastify({ logger: false });
  await registerIdentity(app);
  const rooms = new RoomRegistry();
  // expose registry on the app for downstream tests/handlers
  (app as unknown as { rooms: RoomRegistry }).rooms = rooms;
  registerRest(app, rooms);
  app.get('/healthz', async () => ({ ok: true }));
  return app;
}
// ...keep start() and bottom unchanged
```

- [ ] **Step 5: Run, verify PASS**

- [ ] **Step 6: Commit**

```bash
cd /home/leevince/mahjong
git add packages/server
git commit -m "server: REST POST /api/rooms creates a room"
```

---

## Task 6: REST — join + start

**Files:**
- Modify: `packages/server/src/rest.ts`
- Modify: `packages/server/tests/rest.test.ts`

- [ ] **Step 1: Append failing tests to `packages/server/tests/rest.test.ts`**

```ts
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
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Replace `packages/server/src/rest.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { getPlayerId } from './identity.js';
import { RoomRegistry } from './rooms.js';
import {
  initialState, seededRng, heuristicPolicy, type Seat,
} from '@mahjong/engine';
import { randomBytes } from 'node:crypto';

export function registerRest(app: FastifyInstance, rooms: RoomRegistry) {
  app.post('/api/rooms', async (req) => {
    const playerId = getPlayerId(req);
    const room = rooms.create(playerId);
    return { roomCode: room.code, playerId };
  });

  app.post<{ Params: { code: string }; Body: { displayName: string } }>(
    '/api/rooms/:code/join',
    async (req, reply) => {
      const room = rooms.get(req.params.code);
      if (!room) return reply.code(404).send({ error: 'room not found' });
      const playerId = getPlayerId(req);
      const displayName = req.body?.displayName?.trim() || 'Player';
      try {
        const seat = rooms.joinAsHuman(room.code, playerId, displayName);
        return { seat };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'join failed';
        if (/full/i.test(msg)) return reply.code(409).send({ error: msg });
        return reply.code(400).send({ error: msg });
      }
    },
  );

  app.post<{ Params: { code: string } }>(
    '/api/rooms/:code/start',
    async (req, reply) => {
      const room = rooms.get(req.params.code);
      if (!room) return reply.code(404).send({ error: 'room not found' });
      const playerId = getPlayerId(req);
      if (room.host !== playerId) return reply.code(403).send({ error: 'host only' });
      if (room.phase !== 'lobby') return reply.code(409).send({ error: 'already started' });

      for (const seat of [0, 1, 2, 3] as Seat[]) {
        if (room.seats[seat].kind === 'empty') {
          room.seats[seat] = { kind: 'bot', policyName: heuristicPolicy.name };
          room.policies[seat] = heuristicPolicy;
        }
      }
      const seed = randomBytes(4).readUInt32BE(0);
      room.state = initialState(seededRng(seed));
      room.phase = 'playing';
      return reply.code(204).send();
    },
  );
}
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Commit**

```bash
cd /home/leevince/mahjong
git add packages/server
git commit -m "server: REST join + start (fills bots, deals initial state)"
```

---

## Task 7: Socket.IO bootstrap + c:hello / s:snapshot

**Files:**
- Create: `packages/server/src/protocol.ts`
- Create: `packages/server/src/socket.ts`
- Create: `packages/server/src/redact.ts`
- Modify: `packages/server/src/index.ts`
- Create: `packages/server/tests/socket.test.ts`

- [ ] **Step 1: Write `packages/server/src/protocol.ts`** (no test — types only)

```ts
import type { Event, Intent, RedactedGameState, Seat } from '@mahjong/engine';
import type { SeatBinding } from './rooms.js';

// Client → Server
export type ClientHello  = { roomCode: string; playerId: string };
export type ClientIntent = { roomCode: string; intent: Intent };

// Server → Client
export type ServerSnapshot = { state: RedactedGameState };
export type ServerEvent    = { event: Event; seq: number };
export type ServerLobby    = { seats: Record<Seat, SeatBinding>; host: string };
export type ServerError    = { code: string; message: string };
```

- [ ] **Step 2: Write `packages/server/src/redact.ts`**

```ts
import type { Server as IOServer } from 'socket.io';
import type { Event, GameState, Seat } from '@mahjong/engine';
import { redactFor } from '@mahjong/engine';
import type { Room } from './rooms.js';

const SEATS: readonly Seat[] = [0, 1, 2, 3];

/**
 * Broadcast a state-change event to every connected human in the room,
 * redacted per recipient. Bots don't receive events.
 *
 * Caller pre-increments `room.seq` and passes the new value.
 */
export function broadcastEvent(io: IOServer, room: Room, event: Event) {
  room.seq++;
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind !== 'human' || !b.connected) continue;
    const redacted = redactSingleEvent(event, seat);
    io.of('/game').to(playerRoom(b.playerId)).emit('s:event', { event: redacted, seq: room.seq });
  }
}

/**
 * Send a fresh snapshot to a specific player.
 */
export function sendSnapshot(io: IOServer, room: Room, playerId: string, viewerSeat: Seat) {
  if (!room.state) return;
  const snapshot = redactFor(room.state, viewerSeat);
  io.of('/game').to(playerRoom(playerId)).emit('s:snapshot', { state: snapshot });
}

/**
 * Per-recipient redaction of the only event type that carries private info:
 * `drew` with tileForSeat. All other events are public.
 */
function redactSingleEvent(event: Event, viewer: Seat): Event {
  if (event.t === 'drew' && event.seat !== viewer && 'tileForSeat' in event) {
    return { t: 'drew', seat: event.seat };
  }
  return event;
}

export function playerRoom(playerId: string): string {
  return `player:${playerId}`;
}

export function gameRoom(code: string): string {
  return `room:${code}`;
}
```

- [ ] **Step 3: Write `packages/server/src/socket.ts`**

```ts
import type { Server as IOServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { RoomRegistry } from './rooms.js';
import type { ClientHello } from './protocol.js';
import { gameRoom, playerRoom, sendSnapshot } from './redact.js';
import type { Seat } from '@mahjong/engine';

const SEATS: readonly Seat[] = [0, 1, 2, 3];

export function attachSocketIo(httpServer: HttpServer, rooms: RoomRegistry): IOServer {
  const io = new Server(httpServer, { cors: { origin: true, credentials: true } });
  const ns = io.of('/game');

  ns.on('connection', (socket) => {
    socket.on('c:hello', (msg: ClientHello) => {
      const room = rooms.get(msg.roomCode);
      if (!room) {
        socket.emit('s:error', { code: 'no_room', message: 'room not found' });
        return;
      }
      const seat = findSeat(room, msg.playerId);
      if (seat === null) {
        socket.emit('s:error', { code: 'not_seated', message: 'not seated in this room' });
        return;
      }
      socket.join(gameRoom(room.code));
      socket.join(playerRoom(msg.playerId));
      sendSnapshot(io, room, msg.playerId, seat);
    });
  });

  return io;
}

function findSeat(room: ReturnType<RoomRegistry['get']> & object, playerId: string): Seat | null {
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind === 'human' && b.playerId === playerId) return seat;
  }
  return null;
}
```

- [ ] **Step 4: Modify `packages/server/src/index.ts`** to attach Socket.IO once `app.server` is bound

```ts
import Fastify from 'fastify';
import { PORT, HOST } from './env.js';
import { registerIdentity } from './identity.js';
import { registerRest } from './rest.js';
import { RoomRegistry } from './rooms.js';
import { attachSocketIo } from './socket.js';
import type { Server as IOServer } from 'socket.io';

export async function buildApp() {
  const app = Fastify({ logger: false });
  await registerIdentity(app);
  const rooms = new RoomRegistry();
  (app as unknown as { rooms: RoomRegistry }).rooms = rooms;
  registerRest(app, rooms);
  app.get('/healthz', async () => ({ ok: true }));
  let io: IOServer | null = null;
  app.addHook('onReady', async () => {
    io = attachSocketIo(app.server, rooms);
    (app as unknown as { io: IOServer }).io = io;
  });
  app.addHook('onClose', async () => {
    if (io) await io.close();
  });
  return app;
}

export async function start() {
  const app = await buildApp();
  await app.listen({ port: PORT, host: HOST });
  console.log(`mahjong server listening on http://${HOST}:${PORT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 5: Write `packages/server/tests/socket.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../src/index.js';
import { io as ioc } from 'socket.io-client';
import type { FastifyInstance } from 'fastify';

describe('socket.io hello → snapshot', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('responds with s:snapshot after a valid c:hello', async () => {
    app = await buildApp();
    await app.listen({ port: 0 });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') throw new Error('bad address');
    const url = `http://127.0.0.1:${addr.port}`;

    // create + start a room as host
    const hostId = 'h0000000-0000-0000-0000-000000000000';
    const c = await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: `playerId=${hostId}` } });
    const { roomCode } = c.json();
    await app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/start`, headers: { cookie: `playerId=${hostId}` } });

    const sock = ioc(`${url}/game`, { transports: ['websocket'] });
    try {
      const snapshot: { state: { viewer: number } } = await new Promise((resolve, reject) => {
        sock.on('s:snapshot', resolve);
        sock.on('s:error', reject);
        sock.on('connect', () => sock.emit('c:hello', { roomCode, playerId: hostId }));
        setTimeout(() => reject(new Error('timeout')), 3000);
      });
      expect(snapshot.state.viewer).toBe(0); // host is seat 0
    } finally {
      sock.disconnect();
    }
  });
});
```

- [ ] **Step 6: Run, verify PASS**

- [ ] **Step 7: Commit**

```bash
cd /home/leevince/mahjong
git add packages/server pnpm-lock.yaml
git commit -m "server: socket.io c:hello -> s:snapshot with per-seat redaction"
```

---

## Task 8: Dispatcher — applyIntent + broadcast

**Files:**
- Create: `packages/server/src/dispatcher.ts`
- Modify: `packages/server/src/socket.ts`
- Create: `packages/server/tests/dispatcher.test.ts`

- [ ] **Step 1: Write failing test `packages/server/tests/dispatcher.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { initialState, seededRng } from '@mahjong/engine';
import { applyIntent } from '../src/dispatcher.js';
import type { Room } from '../src/rooms.js';

function fakeRoom(): Room {
  return {
    code: 'TEST', createdAt: 0, host: 'h',
    seats: {
      0: { kind: 'human', playerId: 'h', displayName: 'h', connected: true },
      1: { kind: 'bot', policyName: 'random' },
      2: { kind: 'bot', policyName: 'random' },
      3: { kind: 'bot', policyName: 'random' },
    },
    state: initialState(seededRng(1)),
    policies: { 0: null, 1: null, 2: null, 3: null },
    graceTimers: { 0: null, 1: null, 2: null, 3: null },
    phase: 'playing', endedAt: null, seq: 0,
    pendingClaims: new Map(),
  };
}

describe('applyIntent', () => {
  it('rejects an illegal intent and does not mutate state', () => {
    const room = fakeRoom();
    const before = room.state!.phase.t;
    const result = applyIntent(room, 1, {
      t: 'discard', seat: 1,
      tile: room.state!.hands[0]!.concealed[0]!,
    });
    expect(result.ok).toBe(false);
    expect(room.state!.phase.t).toBe(before);
  });

  it('accepts a legal discard from the active seat, advances phase, returns events', () => {
    const room = fakeRoom();
    const tile = room.state!.hands[0]!.concealed[0]!;
    const result = applyIntent(room, 0, { t: 'discard', seat: 0, tile });
    expect(result.ok).toBe(true);
    expect(room.state!.phase.t).toBe('awaitClaims');
    if (result.ok) {
      expect(result.events.some((e) => e.t === 'discarded')).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement `packages/server/src/dispatcher.ts`**

```ts
import { step, legalIntents, type Intent, type Event, type Seat } from '@mahjong/engine';
import type { Room } from './rooms.js';

export type ApplyResult =
  | { ok: true;  events: Event[] }
  | { ok: false; code: string; message: string };

export function applyIntent(room: Room, fromSeat: Seat, intent: Intent): ApplyResult {
  if (!room.state) return { ok: false, code: 'no_state', message: 'room not started' };
  if (intent.seat !== fromSeat) {
    return { ok: false, code: 'wrong_seat', message: 'intent seat must equal sender' };
  }
  const legal = legalIntents(room.state, fromSeat);
  if (!legal.some((i) => sameIntent(i, intent))) {
    return { ok: false, code: 'illegal', message: 'intent not legal in current phase' };
  }
  const [next, events] = step(room.state, intent);
  room.state = next;
  return { ok: true, events };
}

function sameIntent(a: Intent, b: Intent): boolean {
  if (a.t !== b.t) return false;
  if (a.seat !== b.seat) return false;
  if (a.t === 'discard'              && b.t === 'discard')              return tileSig(a.tile) === tileSig(b.tile);
  if (a.t === 'pass'                 && b.t === 'pass')                 return true;
  if (a.t === 'declareSelfWin'       && b.t === 'declareSelfWin')       return true;
  if (a.t === 'declareConcealedKong' && b.t === 'declareConcealedKong') return tileSig(a.tile) === tileSig(b.tile);
  if (a.t === 'claim'                && b.t === 'claim'                && a.kind === b.kind) {
    if (a.tiles.length !== b.tiles.length) return false;
    return a.tiles.every((t, i) => tileSig(t) === tileSig(b.tiles[i]!));
  }
  return false;
}

function tileSig(t: import('@mahjong/engine').Tile): string {
  switch (t.kind) {
    case 'suit':   return `${t.suit}${t.rank}`;
    case 'honor':  return t.honor;
    case 'flower': return t.flower;
  }
}
```

- [ ] **Step 4: Wire `c:intent` handler into `packages/server/src/socket.ts`**

Add inside `ns.on('connection', (socket) => { ... })`:

```ts
socket.on('c:intent', (msg: import('./protocol.js').ClientIntent) => {
  const room = rooms.get(msg.roomCode);
  if (!room) return socket.emit('s:error', { code: 'no_room', message: 'room not found' });
  const playerId = socket.handshake.auth?.playerId
    ?? extractPlayerIdFromCookie(socket.handshake.headers.cookie);
  const seat = findSeat(room, playerId ?? '');
  if (seat === null) return socket.emit('s:error', { code: 'not_seated', message: 'not seated' });
  const result = applyIntent(room, seat, msg.intent);
  if (!result.ok) return socket.emit('s:error', { code: result.code, message: result.message });
  for (const ev of result.events) broadcastEvent(io, room, ev);
});
```

Add the import at top: `import { applyIntent } from './dispatcher.js';` and `import { broadcastEvent } from './redact.js';`.

Add helper at file end:

```ts
function extractPlayerIdFromCookie(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const m = cookie.match(/playerId=([^;]+)/);
  return m ? m[1]! : null;
}
```

Note: For c:intent, prefer `socket.handshake.auth.playerId` — the client sets it during `io(url, { auth: { playerId } })`. The cookie fallback covers browser direct connects.

- [ ] **Step 5: Run, verify PASS** for dispatcher tests

- [ ] **Step 6: Commit**

```bash
cd /home/leevince/mahjong
git add packages/server
git commit -m "server: applyIntent dispatcher with intent validation + broadcast"
```

---

## Task 9: Pending-claim collection during awaitClaims

**Files:**
- Modify: `packages/server/src/dispatcher.ts`
- Modify: `packages/server/tests/dispatcher.test.ts`

**Why this exists:** When the engine enters `awaitClaims`, MULTIPLE seats may
respond with claim-or-pass. The server must collect all responses, then call
`resolveClaimPriority` to pick the winner, then call `step` once with the
winning intent (or have everyone effectively passed, advancing the turn).

The current `applyIntent` always calls `step` immediately — which is correct
for `awaitDiscard` but wrong for `awaitClaims`. This task fixes it.

- [ ] **Step 1: Append failing test to `packages/server/tests/dispatcher.test.ts`**

```ts
import { resolveClaimPriority } from '@mahjong/engine';

describe('applyIntent — awaitClaims collection', () => {
  it('after dealer discards, the room enters awaitClaims with pendingFrom=[1,2,3]', () => {
    const room = fakeRoom();
    const tile = room.state!.hands[0]!.concealed[0]!;
    const r = applyIntent(room, 0, { t: 'discard', seat: 0, tile });
    expect(r.ok).toBe(true);
    expect(room.state!.phase.t).toBe('awaitClaims');
  });

  it('collects pass-from-each-seat and then advances the turn', () => {
    const room = fakeRoom();
    const tile = room.state!.hands[0]!.concealed[0]!;
    applyIntent(room, 0, { t: 'discard', seat: 0, tile });
    // pass from 1
    let r = applyIntent(room, 1, { t: 'pass', seat: 1 });
    expect(r.ok).toBe(true);
    // still awaiting from 2 and 3
    expect(room.state!.phase.t).toBe('awaitClaims');
    r = applyIntent(room, 2, { t: 'pass', seat: 2 });
    expect(r.ok).toBe(true);
    r = applyIntent(room, 3, { t: 'pass', seat: 3 });
    expect(r.ok).toBe(true);
    // now turn advances to seat 1
    expect(room.state!.phase.t).toBe('awaitDiscard');
    if (room.state!.phase.t === 'awaitDiscard') {
      expect(room.state!.phase.seat).toBe(1);
    }
  });
});
```

- [ ] **Step 2: Run, verify FAIL** (current dispatcher passes 1st pass through to step, which immediately advances turn rather than waiting)

- [ ] **Step 3: Replace `packages/server/src/dispatcher.ts`** with the claim-collection version

```ts
import {
  step, legalIntents, resolveClaimPriority,
  type Intent, type Event, type Seat, type Tile,
} from '@mahjong/engine';
import type { Room } from './rooms.js';

export type ApplyResult =
  | { ok: true;  events: Event[] }
  | { ok: false; code: string; message: string };

const SEATS: readonly Seat[] = [0, 1, 2, 3];

export function applyIntent(room: Room, fromSeat: Seat, intent: Intent): ApplyResult {
  if (!room.state) return { ok: false, code: 'no_state', message: 'room not started' };
  if (intent.seat !== fromSeat) {
    return { ok: false, code: 'wrong_seat', message: 'intent seat must equal sender' };
  }
  const legal = legalIntents(room.state, fromSeat);
  if (!legal.some((i) => sameIntent(i, intent))) {
    return { ok: false, code: 'illegal', message: 'intent not legal in current phase' };
  }

  if (room.state.phase.t === 'awaitClaims') {
    // Buffer the response; resolve once all pendingFrom have responded.
    room.pendingClaims.set(fromSeat, intent);
    const allResponded = room.state.phase.pendingFrom.every((s) => room.pendingClaims.has(s));
    if (!allResponded) return { ok: true, events: [] };
    const intentsByPriority = room.state.phase.pendingFrom.map((s) => room.pendingClaims.get(s) as Intent);
    const discarder = room.state.phase.from;
    room.pendingClaims.clear();
    const winning = resolveClaimPriority(intentsByPriority, discarder);
    if (winning) return runStep(room, winning);
    // All passed → pick any pass to feed step (it doesn't matter which seat passes "last")
    const anyPass = intentsByPriority.find((i): i is Extract<Intent, { t: 'pass' }> => i.t === 'pass')!;
    return runStep(room, anyPass);
  }

  return runStep(room, intent);
}

function runStep(room: Room, intent: Intent): ApplyResult {
  const [next, events] = step(room.state!, intent);
  room.state = next;
  return { ok: true, events };
}

function sameIntent(a: Intent, b: Intent): boolean {
  if (a.t !== b.t) return false;
  if (a.seat !== b.seat) return false;
  if (a.t === 'discard'              && b.t === 'discard')              return tileSig(a.tile) === tileSig(b.tile);
  if (a.t === 'pass'                 && b.t === 'pass')                 return true;
  if (a.t === 'declareSelfWin'       && b.t === 'declareSelfWin')       return true;
  if (a.t === 'declareConcealedKong' && b.t === 'declareConcealedKong') return tileSig(a.tile) === tileSig(b.tile);
  if (a.t === 'claim'                && b.t === 'claim'                && a.kind === b.kind) {
    if (a.tiles.length !== b.tiles.length) return false;
    return a.tiles.every((t, i) => tileSig(t) === tileSig(b.tiles[i]!));
  }
  return false;
}

function tileSig(t: Tile): string {
  switch (t.kind) {
    case 'suit':   return `${t.suit}${t.rank}`;
    case 'honor':  return t.honor;
    case 'flower': return t.flower;
  }
}
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Commit**

```bash
cd /home/leevince/mahjong
git add packages/server
git commit -m "server: collect pendingClaims across seats then resolve priority once"
```

---

## Task 10: Bot scheduler

**Files:**
- Create: `packages/server/src/bot-scheduler.ts`
- Modify: `packages/server/src/socket.ts`
- Modify: `packages/server/src/rest.ts` (auto-tick bots after start)

- [ ] **Step 1: Write `packages/server/src/bot-scheduler.ts`** (no separate unit test — integration test in Task 13 covers it)

```ts
import type { Server as IOServer } from 'socket.io';
import { buildBotView, seededRng, type Seat } from '@mahjong/engine';
import type { Room } from './rooms.js';
import { applyIntent } from './dispatcher.js';
import { broadcastEvent } from './redact.js';

const SEATS: readonly Seat[] = [0, 1, 2, 3];

/** Returns the seat that owes the next action, or null if no seat does. */
export function nextActor(room: Room): Seat | null {
  const s = room.state;
  if (!s || s.phase.t === 'ended') return null;
  if (s.phase.t === 'awaitDiscard') return s.phase.seat;
  // awaitClaims: the first pending seat that hasn't yet responded
  for (const seat of s.phase.pendingFrom) {
    if (!room.pendingClaims.has(seat)) return seat;
  }
  return null;
}

/** Sleep helper (no-op when in fakeTimers; real ms otherwise). */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * If the next actor is a bot, fetch its intent and apply. Loop while bots
 * continue to own consecutive decisions. Yields jittered delays (400–900ms)
 * between bot actions so play doesn't feel uncannily instant.
 */
export async function maybeRunBotTurns(io: IOServer, room: Room): Promise<void> {
  while (true) {
    const seat = nextActor(room);
    if (seat === null) return;
    const b = room.seats[seat];
    if (b.kind !== 'bot') return;
    const policy = room.policies[seat];
    if (!policy) return;
    await sleep(400 + Math.floor(Math.random() * 500));
    const view = buildBotView(room.state!, seat, seededRng(room.seq + seat + 1));
    const intent = policy.decide(view);
    const result = applyIntent(room, seat, intent);
    if (!result.ok) return; // shouldn't happen; bots can only emit legal intents
    for (const ev of result.events) broadcastEvent(io, room, ev);
  }
}
```

- [ ] **Step 2: Update `packages/server/src/socket.ts`** — after a human intent is applied, drive the bot scheduler

Replace the `c:intent` handler body:

```ts
socket.on('c:intent', async (msg: import('./protocol.js').ClientIntent) => {
  const room = rooms.get(msg.roomCode);
  if (!room) return socket.emit('s:error', { code: 'no_room', message: 'room not found' });
  const playerId = socket.handshake.auth?.playerId
    ?? extractPlayerIdFromCookie(socket.handshake.headers.cookie);
  const seat = findSeat(room, playerId ?? '');
  if (seat === null) return socket.emit('s:error', { code: 'not_seated', message: 'not seated' });
  const result = applyIntent(room, seat, msg.intent);
  if (!result.ok) return socket.emit('s:error', { code: result.code, message: result.message });
  for (const ev of result.events) broadcastEvent(io, room, ev);
  await maybeRunBotTurns(io, room);
});
```

Add import: `import { maybeRunBotTurns } from './bot-scheduler.js';`

- [ ] **Step 3: Update `packages/server/src/rest.ts`** — after starting a room, if the dealer is a bot (it isn't normally — the host is always seat 0), still kick the scheduler in case

Wait — the host is always seat 0 (dealer), so a bot will never start. But for robustness:

In the `/api/rooms/:code/start` handler, after setting `room.state` and `room.phase = 'playing'`, add:

```ts
const io = (req.server as unknown as { io?: import('socket.io').Server }).io;
if (io) {
  // Don't await — fire and forget so the REST response isn't held
  void import('./bot-scheduler.js').then(({ maybeRunBotTurns }) => maybeRunBotTurns(io, room));
}
```

(The `import()` is dynamic to avoid a circular import at module-load time.)

- [ ] **Step 4: Run all tests, verify still PASS**

- [ ] **Step 5: Commit**

```bash
cd /home/leevince/mahjong
git add packages/server
git commit -m "server: bot scheduler with jittered delay after each human action"
```

---

## Task 11: Disconnect grace timer + bot takeover

**Files:**
- Create: `packages/server/src/grace.ts`
- Modify: `packages/server/src/socket.ts`

- [ ] **Step 1: Write `packages/server/src/grace.ts`**

```ts
import type { Server as IOServer } from 'socket.io';
import type { Room, SeatBinding } from './rooms.js';
import { heuristicPolicy, type Seat } from '@mahjong/engine';
import { maybeRunBotTurns } from './bot-scheduler.js';

export const GRACE_MS = 60_000;
const SEATS: readonly Seat[] = [0, 1, 2, 3];

/** Mark the human as disconnected; arm a grace timer that flips them to bot if not back in 60s. */
export function onPlayerDisconnect(io: IOServer, room: Room, playerId: string): void {
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind !== 'human' || b.playerId !== playerId) continue;
    b.connected = false;
    if (room.graceTimers[seat]) clearTimeout(room.graceTimers[seat]!);
    room.graceTimers[seat] = setTimeout(() => {
      room.graceTimers[seat] = null;
      const cur: SeatBinding = room.seats[seat];
      if (cur.kind !== 'human' || cur.connected) return;
      room.seats[seat] = { kind: 'bot', policyName: heuristicPolicy.name };
      room.policies[seat] = heuristicPolicy;
      void maybeRunBotTurns(io, room);
    }, GRACE_MS);
  }
}

/** Cancel the grace timer for the seat the player is in. */
export function onPlayerReconnect(room: Room, playerId: string): void {
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind !== 'human' || b.playerId !== playerId) continue;
    b.connected = true;
    if (room.graceTimers[seat]) {
      clearTimeout(room.graceTimers[seat]!);
      room.graceTimers[seat] = null;
    }
  }
}
```

- [ ] **Step 2: Wire into `packages/server/src/socket.ts`**

Inside `ns.on('connection', (socket) => { ... })`, add:

```ts
socket.on('disconnect', () => {
  // We have to remember which room and which playerId — stash on socket.data on c:hello
  const data = socket.data as { roomCode?: string; playerId?: string };
  if (!data.roomCode || !data.playerId) return;
  const room = rooms.get(data.roomCode);
  if (!room) return;
  onPlayerDisconnect(io, room, data.playerId);
});
```

And in the `c:hello` handler, after `socket.join`:

```ts
socket.data = { roomCode: room.code, playerId: msg.playerId };
onPlayerReconnect(room, msg.playerId);
```

Add imports: `import { onPlayerDisconnect, onPlayerReconnect } from './grace.js';`

- [ ] **Step 3: Run all tests, verify PASS**

- [ ] **Step 4: Commit**

```bash
cd /home/leevince/mahjong
git add packages/server
git commit -m "server: 60s grace timer flips disconnected seats to heuristic bot"
```

---

## Task 12: REST snapshot endpoint

**Files:**
- Modify: `packages/server/src/rest.ts`
- Modify: `packages/server/tests/rest.test.ts`

- [ ] **Step 1: Append failing test**

```ts
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
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Add the endpoint to `packages/server/src/rest.ts`** (append inside `registerRest`)

```ts
import { redactFor, type Seat } from '@mahjong/engine';

const SEATS: readonly Seat[] = [0, 1, 2, 3];

app.get<{ Params: { code: string } }>(
  '/api/rooms/:code/snapshot',
  async (req, reply) => {
    const room = rooms.get(req.params.code);
    if (!room || !room.state) return reply.code(404).send({ error: 'not started' });
    const playerId = getPlayerId(req);
    let mySeat: Seat | null = null;
    for (const seat of SEATS) {
      const b = room.seats[seat];
      if (b.kind === 'human' && b.playerId === playerId) { mySeat = seat; break; }
    }
    if (mySeat === null) return reply.code(403).send({ error: 'not seated' });
    return redactFor(room.state, mySeat);
  },
);
```

(Move the `import` and `const SEATS` to the top of the file alongside the others — don't duplicate.)

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Commit**

```bash
cd /home/leevince/mahjong
git add packages/server
git commit -m "server: REST GET /api/rooms/:code/snapshot for hard-refresh recovery"
```

---

## Task 13: Integration test — happy path (1 human + 3 bots play a full hand)

**Files:**
- Create: `packages/server/tests/integration/happy-path.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../../src/index.js';
import { io as ioc } from 'socket.io-client';
import type { FastifyInstance } from 'fastify';

describe('integration: 1 human + 3 bots play a full hand', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('hand ends within 400 turns and emits a final won or drawWall event', async () => {
    app = await buildApp();
    await app.listen({ port: 0 });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') throw new Error('bad address');
    const url = `http://127.0.0.1:${addr.port}`;

    const hostId = '00000000-0000-0000-0000-aaaaaaaaaaaa';
    const c = await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: `playerId=${hostId}` } });
    const { roomCode } = c.json();
    await app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/start`, headers: { cookie: `playerId=${hostId}` } });

    const sock = ioc(`${url}/game`, { transports: ['websocket'], auth: { playerId: hostId } });
    const events: { t: string; payload: unknown }[] = [];

    try {
      let snapshot: { state: unknown } | null = null;
      await new Promise<void>((resolve, reject) => {
        sock.on('s:snapshot', (s: { state: unknown }) => { snapshot = s; resolve(); });
        sock.on('s:error', (e) => reject(new Error(JSON.stringify(e))));
        sock.on('connect', () => sock.emit('c:hello', { roomCode, playerId: hostId }));
        setTimeout(() => reject(new Error('snapshot timeout')), 3000);
      });
      expect(snapshot).not.toBeNull();

      sock.on('s:event', (msg: { event: { t: string } }) => events.push({ t: msg.event.t, payload: msg.event }));

      // The host (seat 0) is human; bots fill 1/2/3. The bot scheduler kicks
      // off the dealer's first action — but wait: dealer is seat 0 (human).
      // We need to discard for the human to start play. Pick the first legal
      // discard from the snapshot's own hand.
      const hand = (snapshot as unknown as { state: { hands: Record<number, { own: boolean; concealed: Array<{ kind: string }> }> } }).state.hands[0];
      if (!hand.own) throw new Error('host hand not own=true');
      sock.emit('c:intent', {
        roomCode,
        intent: { t: 'discard', seat: 0, tile: hand.concealed[0] },
      });

      // Now wait until a won or drawWall event arrives, or 10 seconds.
      await new Promise<void>((resolve, reject) => {
        sock.on('s:event', (msg: { event: { t: string } }) => {
          if (msg.event.t === 'won' || msg.event.t === 'drawWall') resolve();
        });
        setTimeout(() => reject(new Error('hand did not end in 10s')), 10_000);
      });

      // Some pass intents are needed when the bots discard and host must pass —
      // for this baseline test, assume the bots' actions don't trigger claims
      // that require host input. If they do, the test will time out and we'll
      // know we need to wire the host's auto-pass logic.
      // (Heuristic bots discard mostly inert tiles early, so this usually works.)
      const won = events.find((e) => e.t === 'won' || e.t === 'drawWall');
      expect(won).toBeDefined();
    } finally {
      sock.disconnect();
    }
  }, 15_000);
});
```

(This test is **soft** — it doesn't fail the build aggressively if the bots happen to discard a tile the host could claim. We'll address auto-pass for the human in Task 14 if needed. The intent here is a smoke test that the wiring is correct end-to-end.)

- [ ] **Step 2: Run, observe**

```bash
source /home/leevince/mahjong/scripts/dev-env.sh && cd /home/leevince/mahjong && npx --yes pnpm@9.0.0 --filter @mahjong/server test integration/happy-path
```

- [ ] **Step 3: If it times out** because the bots discard a tile the host could claim, the host (which is doing nothing) blocks the hand. Two ways to fix:
   a. Add an auto-pass on the test side: subscribe to `s:event` for `discarded`, check if the discarder isn't us, emit pass-from-our-seat.
   b. Make the test all-bots by joining the host as a 0-th bot too.

   Apply (a) — add to the test, before "Now wait":

```ts
sock.on('s:event', (msg: { event: { t: string; seat?: number } }) => {
  if (msg.event.t === 'discarded' && msg.event.seat !== 0) {
    sock.emit('c:intent', { roomCode, intent: { t: 'pass', seat: 0 } });
  }
});
```

   And after the host's first discard, when it's our turn again (we'll see a `drew` event for seat 0), discard the first tile:

```ts
sock.on('s:event', (msg: { event: { t: string; seat?: number; tileForSeat?: unknown } }) => {
  if (msg.event.t === 'drew' && msg.event.seat === 0 && msg.event.tileForSeat) {
    // Re-fetch our hand via snapshot. Simplest: keep a local copy that we update.
    // For this test, request a snapshot and discard the first tile.
    sock.emit('c:intent', { roomCode, intent: { t: 'discard', seat: 0, tile: msg.event.tileForSeat } });
  }
});
```

(This naive "discard-what-you-just-drew" strategy keeps the hand moving without scoring well, but the test only cares about reaching an end state.)

- [ ] **Step 4: Run again, verify PASS**

- [ ] **Step 5: Commit**

```bash
cd /home/leevince/mahjong
git add packages/server
git commit -m "server: integration test — happy path 1 human + 3 bots plays a full hand"
```

---

## Task 14: Integration test — reconnect

**Files:**
- Create: `packages/server/tests/integration/reconnect.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildApp } from '../../src/index.js';
import { io as ioc } from 'socket.io-client';
import type { FastifyInstance } from 'fastify';

describe('integration: disconnect and reconnect within grace window', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => { if (app) await app.close(); app = null; vi.useRealTimers(); });

  it('reconnect within 60s preserves the seat (still human, not bot)', async () => {
    app = await buildApp();
    await app.listen({ port: 0 });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') throw new Error('bad address');
    const url = `http://127.0.0.1:${addr.port}`;

    const hostId = '00000000-0000-0000-0000-aaaaaaaaaaaa';
    const c = await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: `playerId=${hostId}` } });
    const { roomCode } = c.json();
    await app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/start`, headers: { cookie: `playerId=${hostId}` } });

    const sock1 = ioc(`${url}/game`, { transports: ['websocket'], auth: { playerId: hostId } });
    await new Promise<void>((resolve, reject) => {
      sock1.on('s:snapshot', () => resolve());
      sock1.on('s:error', (e) => reject(new Error(JSON.stringify(e))));
      sock1.on('connect', () => sock1.emit('c:hello', { roomCode, playerId: hostId }));
      setTimeout(() => reject(new Error('hello timeout')), 3000);
    });
    sock1.disconnect();

    // Server has armed a 60s grace timer; advance ~30s of clock would require
    // injecting timers into the server, which we don't. Instead reconnect
    // quickly and assert the room still shows host as human.
    await new Promise((r) => setTimeout(r, 200));

    const sock2 = ioc(`${url}/game`, { transports: ['websocket'], auth: { playerId: hostId } });
    await new Promise<void>((resolve, reject) => {
      sock2.on('s:snapshot', () => resolve());
      sock2.on('s:error', (e) => reject(new Error(JSON.stringify(e))));
      sock2.on('connect', () => sock2.emit('c:hello', { roomCode, playerId: hostId }));
      setTimeout(() => reject(new Error('hello timeout')), 3000);
    });

    const rooms = (app as unknown as { rooms: import('../../src/rooms.js').RoomRegistry }).rooms;
    const room = rooms.get(roomCode)!;
    expect(room.seats[0].kind).toBe('human');
    if (room.seats[0].kind === 'human') {
      expect(room.seats[0].connected).toBe(true);
    }
    sock2.disconnect();
  });
});
```

(We're not testing the 60s timeout flip here — that requires injecting `setTimeout` into `grace.ts`. We trust the timer code by inspection and assert the reconnect path.)

- [ ] **Step 2: Run, verify PASS**

- [ ] **Step 3: Commit**

```bash
cd /home/leevince/mahjong
git add packages/server
git commit -m "server: integration test — reconnect within grace preserves seat"
```

---

## Task 15: Integration test — illegal intents

**Files:**
- Create: `packages/server/tests/integration/illegal-intents.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../../src/index.js';
import { io as ioc } from 'socket.io-client';
import type { FastifyInstance } from 'fastify';

describe('integration: illegal intents get s:error and do not mutate state', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('out-of-turn discard returns s:error with code illegal', async () => {
    app = await buildApp();
    await app.listen({ port: 0 });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') throw new Error('bad address');
    const url = `http://127.0.0.1:${addr.port}`;

    const hostId = '00000000-0000-0000-0000-bbbbbbbbbbbb';
    const c = await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: `playerId=${hostId}` } });
    const { roomCode } = c.json();
    await app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/start`, headers: { cookie: `playerId=${hostId}` } });

    const sock = ioc(`${url}/game`, { transports: ['websocket'], auth: { playerId: hostId } });
    let snap: { state: { hands: Record<number, { concealed?: { kind: string }[] }> } } | null = null;
    await new Promise<void>((resolve, reject) => {
      sock.on('s:snapshot', (s: typeof snap) => { snap = s; resolve(); });
      sock.on('connect', () => sock.emit('c:hello', { roomCode, playerId: hostId }));
      setTimeout(() => reject(new Error('hello timeout')), 3000);
    });

    // Emit a discard intent claiming to be seat 1 (not us).
    const tile = snap!.state.hands[0]!.concealed![0];
    const errP = new Promise<{ code: string }>((resolve, reject) => {
      sock.on('s:error', resolve);
      setTimeout(() => reject(new Error('no s:error')), 3000);
    });
    sock.emit('c:intent', { roomCode, intent: { t: 'discard', seat: 1, tile } });
    const err = await errP;
    expect(err.code).toMatch(/wrong_seat|illegal/);

    sock.disconnect();
  });
});
```

- [ ] **Step 2: Run, verify PASS**

- [ ] **Step 3: Commit**

```bash
cd /home/leevince/mahjong
git add packages/server
git commit -m "server: integration test — illegal intents rejected with s:error"
```

---

## Task 16: Static file serving + placeholder client

**Files:**
- Create: `packages/server/src/static.ts`
- Create: `packages/client/dist/index.html` (placeholder until Plan 3)
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Create placeholder client `packages/client/dist/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Mahjong (placeholder)</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>body{font-family:system-ui,sans-serif;margin:2em;line-height:1.4}</style>
  </head>
  <body>
    <h1>Mahjong server is up.</h1>
    <p>The client UI is not built yet — that's Plan 3 of the implementation plan. The server's REST and WebSocket endpoints work.</p>
    <p>Try:</p>
    <pre>curl -X POST http://localhost:3000/api/rooms
    curl http://localhost:3000/healthz</pre>
  </body>
</html>
```

- [ ] **Step 2: Write `packages/server/src/static.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

export async function registerStatic(app: FastifyInstance) {
  const here = dirname(fileURLToPath(import.meta.url));
  // dev: packages/server/src → packages/client/dist
  // prod: dist files are copied next to server; check both
  const candidates = [
    resolve(here, '../../client/dist'),
    resolve(here, '../../../packages/client/dist'),
    resolve(here, '../client-dist'),
  ];
  const root = candidates.find((p) => existsSync(p));
  if (!root) {
    app.get('/', async () => 'mahjong server (no client built)');
    return;
  }
  await app.register(fastifyStatic, { root, prefix: '/', wildcard: false });
  // SPA fallback: serve index.html for any non-API non-asset path
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/socket.io/')) {
      return reply.code(404).send({ error: 'not found' });
    }
    return reply.type('text/html').sendFile('index.html', root);
  });
}
```

- [ ] **Step 3: Wire into `packages/server/src/index.ts`** — register after REST:

```ts
import { registerStatic } from './static.js';
// ...
registerRest(app, rooms);
await registerStatic(app);
app.get('/healthz', async () => ({ ok: true }));
```

- [ ] **Step 4: Manually verify the static serve**

```bash
source /home/leevince/mahjong/scripts/dev-env.sh && cd /home/leevince/mahjong && npx --yes pnpm@9.0.0 --filter @mahjong/server exec tsx src/index.ts &
SERVER_PID=$!
sleep 2
curl -s http://localhost:3000/ | head -3
kill $SERVER_PID
```

Expected: the placeholder HTML appears. (If port 3000 is taken, override with `PORT=3010` before the command.)

- [ ] **Step 5: Commit**

```bash
cd /home/leevince/mahjong
git add packages/server packages/client/dist
git commit -m "server: serve static client dist (placeholder for Plan 3)"
```

---

## Task 17: Dockerfile + fly.toml + deploy docs

**Files:**
- Create: `Dockerfile` (at repo root)
- Create: `.dockerignore`
- Create: `fly.toml`
- Create: `docs/DEPLOY.md`

- [ ] **Step 1: Write `.dockerignore`**

```
node_modules
**/node_modules
**/dist
.git
.github
.vscode
**/.DS_Store
**/*.log
**/coverage
**/playwright-report
**/test-results
docs
*.md
```

- [ ] **Step 2: Write `Dockerfile`** (multi-stage)

```dockerfile
# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/ 2>/dev/null || true
RUN pnpm install --frozen-lockfile --prod=false

FROM deps AS build
COPY packages/engine ./packages/engine
COPY packages/server ./packages/server
COPY packages/client/dist ./packages/client/dist
RUN pnpm -r build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/engine/package.json /app/packages/engine/dist ./packages/engine/
COPY --from=build /app/packages/server/package.json /app/packages/server/dist ./packages/server/
COPY --from=build /app/packages/client/dist ./packages/client/dist
RUN pnpm install --frozen-lockfile --prod
EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
```

(The exact COPY layout for `dist` directories depends on how `tsc -b` emits — verify after a local build that the paths line up.)

- [ ] **Step 3: Write `fly.toml`**

```toml
app = "mahjong"
primary_region = "ord"   # change to your nearest Fly region

[build]

[env]
  NODE_ENV = "production"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256

[checks.health]
  type = "http"
  port = 3000
  method = "GET"
  path = "/healthz"
  interval = "15s"
  timeout = "2s"
  grace_period = "30s"
```

- [ ] **Step 4: Write `docs/DEPLOY.md`**

```markdown
# Deploy

The mahjong server deploys as a single container to [Fly.io](https://fly.io).

## One-time setup

1. Install the Fly CLI: <https://fly.io/docs/hands-on/install-flyctl/>
2. `fly auth login`
3. `fly launch --copy-config --no-deploy` from the repo root — accept the existing
   `fly.toml`. If you want a name other than `mahjong`, set it in `fly.toml` before
   running this.

## Each deploy

    fly deploy

Fly builds the Docker image, rolls a new machine, runs `/healthz` until it
returns 200, then routes traffic to it. ~60s.

## Verifying

    curl https://<your-app>.fly.dev/healthz
    open https://<your-app>.fly.dev

## Notes

- Active rooms live in memory and are LOST on each deploy. Single-hand rooms
  + friends-only usage make this acceptable. Have friends recreate the room.
- Fly's free tier (3× shared-cpu-1x @ 256MB) is sufficient. Auto-stop saves
  budget by halting the machine when idle.
- The cookie set by the server uses `Secure` in production — friends must
  reach the app over HTTPS (which `fly.dev` provides automatically).

## Local production-mode test

    docker build -t mahjong .
    docker run --rm -p 3000:3000 mahjong
    open http://localhost:3000

```

- [ ] **Step 5: Local Docker test (optional but recommended)**

```bash
cd /home/leevince/mahjong
docker build -t mahjong . 2>&1 | tail -20
docker run -d --rm --name mj -p 3001:3000 mahjong
sleep 3
curl -s http://localhost:3001/healthz
docker stop mj
```

Expected: `{"ok":true}`. (Skip if Docker isn't installed on your dev server; the user can test on their Mac.)

- [ ] **Step 6: Commit**

```bash
cd /home/leevince/mahjong
git add Dockerfile .dockerignore fly.toml docs/DEPLOY.md
git commit -m "deploy: Dockerfile + fly.toml + DEPLOY.md for Fly.io"
```

---

## Done

When all 17 tasks pass:

- `packages/server` is a complete Node + Fastify + Socket.IO server.
- 4+ unit tests + 3 integration tests verify happy path, reconnect, and rejection of illegal intents.
- `Dockerfile` builds a production image.
- `fly.toml` configures the Fly.io deployment.
- The user can `fly deploy` and friends can join via `https://<app>.fly.dev/<roomcode>` using only a 4-character code.

**Next:** Plan 3 — client (Vite + React + Tailwind + Framer Motion + Howler + Playwright E2E).
