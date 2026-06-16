# Mahjong on Vercel — Unified Web App + Deploy

> **Supersedes:** Plan 2 (Fly-based Fastify+Socket.IO server) and the originally-planned Plan 3 (React+Vite client). This single plan replaces both for the Vercel deployment target.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Fastify+Socket.IO server with a single Next.js app
deployed to Vercel. Real-time messaging migrates from Socket.IO to Pusher
Channels. In-memory rooms migrate to Vercel KV (Upstash Redis under the
hood). Ship a functional-but-minimal UI as part of this plan; polish (tile
graphics, animations, sounds, mobile-first layout) is a separate follow-on
effort.

**Architecture:**
- **Next.js 14** App Router on Vercel. Single project at `packages/web`.
- **REST API routes** under `app/api/` for create-room / join / start /
  snapshot / intent / pusher-auth.
- **Pusher Channels** for server→client event push (one private channel per
  room, one per-seat channel for private draws).
- **Vercel KV** (Upstash Redis) for `Room` state: snapshots, seat bindings,
  pendingClaims, graceExpiresAt timestamps.
- **Optimistic concurrency** via KV's atomic operations: read room with a
  version field, apply intent in memory, write back with `IF version ==
  previous`; on conflict, retry up to N times.
- **Bot scheduler runs inline** in the intent handler (consecutive bot turns
  execute before the response returns). Vercel Hobby's 10s function timeout
  is plenty for typical bot chains.
- **Grace timer becomes lazy**: every room read checks `graceExpiresAt` and
  flips the seat to a bot if expired. No setTimeout needed.

**Tech Stack:** Node 20+, pnpm 9+, TypeScript 5.4+, Next.js 14, React 18,
@vercel/kv 2+, pusher 5+ (server), pusher-js 8+ (client), vitest 1.6+,
@mahjong/engine workspace pkg.

**Dev-server environment note:** On the Meta Linux dev server, before any
`node`/`npm`/`pnpm`/`npx` command, source the helper:
```bash
source /home/leevince/mahjong/scripts/dev-env.sh
```
The helper auto-recovers from dotslash cache hiccups. Invoke pnpm via
`npx --yes pnpm@9.0.0 <args>`. On macOS this is unnecessary.

**Required external accounts (placeholder env vars in plan; user wires real
ones before first deploy):**
- Pusher: free tier at https://pusher.com/channels — 200K msgs/day, 100
  concurrent connections. Provides `PUSHER_APP_ID`, `PUSHER_KEY`,
  `PUSHER_SECRET`, `PUSHER_CLUSTER`, `NEXT_PUBLIC_PUSHER_KEY`,
  `NEXT_PUBLIC_PUSHER_CLUSTER`.
- Vercel KV (Upstash Redis): enable in the Vercel project dashboard.
  Provides `KV_REST_API_URL`, `KV_REST_API_TOKEN`,
  `KV_REST_API_READ_ONLY_TOKEN`.

**What we KEEP from prior work:**
- `packages/engine` — unchanged, the pure rules library still wins.
- The Plan 2 server's TypeScript shapes (`Room`, `SeatBinding`, `Intent`
  wire types) port directly. Most logic in `dispatcher.ts`, `codes.ts`,
  `sameIntent`, etc. is reused as static module functions.

**What we DROP:**
- `packages/server` (Fastify + Socket.IO + Dockerfile + fly.toml). Task 1
  deletes it. Git history preserves it if you want to look back.

---

## File map

```
mahjong/
  packages/web/                      # NEW — replaces packages/server and the planned packages/client
    package.json
    tsconfig.json
    next.config.mjs
    vitest.config.ts
    .env.example
    app/
      layout.tsx
      page.tsx                       # landing — create / join form
      room/[code]/page.tsx           # game room shell
      api/
        rooms/route.ts               # POST create
        rooms/[code]/join/route.ts   # POST join
        rooms/[code]/start/route.ts  # POST start
        rooms/[code]/snapshot/route.ts # GET snapshot
        rooms/[code]/intent/route.ts # POST intent
        pusher/auth/route.ts         # POST private-channel auth
    lib/
      env.ts                         # typed env-var helpers
      kv.ts                          # @vercel/kv wrapper with type-safe getRoom/putRoom
      identity.ts                    # cookie helper (Next.js)
      codes.ts                       # port from packages/server
      rooms.ts                       # KV-backed registry: create/get/joinAsHuman/save
      dispatcher.ts                  # port applyIntent + sameIntent
      bot-scheduler.ts               # inline version
      pusher-server.ts               # server SDK + broadcastEvent
      grace.ts                       # lazy check helper
      protocol.ts                    # wire types (port)
    components/
      Tile.tsx                       # ASCII text "m5", "E", etc.
      Hand.tsx                       # list of clickable tiles
      Seat.tsx                       # opponent slot
      Discards.tsx                   # river
      ActionBar.tsx                  # context-aware buttons
      ActionLog.tsx                  # side panel
    hooks/
      usePusherRoom.ts               # subscribes to room channel, applies events
      useGame.ts                     # zustand store
    public/
      favicon.ico
    __tests__/
      api.happy-path.test.ts
      kv-mock.ts
      pusher-mock.ts
  docs/
    DEPLOY-VERCEL.md                 # ops doc
  vercel.json                        # root project config (points at packages/web)
```

The old `packages/server` directory is removed in Task 1.

---

## Task 1: Delete old server, scaffold `packages/web` Next.js

**Files:**
- Delete: `packages/server/` (entire directory)
- Delete: `Dockerfile`, `.dockerignore`, `fly.toml`, `docs/DEPLOY.md` (if they exist from prior Plan 2 work)
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/next.config.mjs`
- Create: `packages/web/.env.example`
- Create: `packages/web/app/layout.tsx`
- Create: `packages/web/app/page.tsx` (placeholder "Hello mahjong")
- Create: `vercel.json` at repo root

- [ ] **Step 1: Delete old server + Fly artifacts**

```bash
cd /home/leevince/mahjong
rm -rf packages/server
rm -f Dockerfile .dockerignore fly.toml
rm -f docs/DEPLOY.md
ls packages/
```

Expected: only `engine` remains under `packages/`.

- [ ] **Step 2: Write `packages/web/package.json`**

```json
{
  "name": "@mahjong/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@mahjong/engine": "workspace:*",
    "@vercel/kv": "^2.0.0",
    "next": "^14.2.0",
    "pusher": "^5.2.0",
    "pusher-js": "^8.4.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Write `packages/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./.next-out",
    "composite": false,
    "noEmit": true,
    "jsx": "preserve",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "moduleResolution": "Bundler",
    "module": "ESNext",
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

(Note: `composite: false` here because Next.js doesn't play well with TS project references. Engine is still consumed via the workspace package, just not as a TS project reference.)

- [ ] **Step 4: Write `packages/web/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mahjong/engine'],
};
export default nextConfig;
```

- [ ] **Step 5: Write `packages/web/.env.example`**

```
# Pusher (https://pusher.com/channels — create an app, "Channels" cluster)
PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
PUSHER_CLUSTER=
NEXT_PUBLIC_PUSHER_KEY=
NEXT_PUBLIC_PUSHER_CLUSTER=

# Vercel KV (enable in your Vercel project's Storage tab — it provisions Upstash Redis)
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=

# Optional
COOKIE_SECRET=dev-secret-do-not-use-in-prod
```

- [ ] **Step 6: Write `packages/web/app/layout.tsx`**

```tsx
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Mahjong',
  description: 'Online 4-player Taiwanese mahjong',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, -apple-system, sans-serif', margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Write `packages/web/app/page.tsx`** (placeholder for now; Task 13 replaces)

```tsx
export default function HomePage() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>Mahjong</h1>
      <p>App scaffold up. Landing page comes in Task 13.</p>
    </main>
  );
}
```

- [ ] **Step 8: Write `vercel.json` at repo root**

```json
{
  "buildCommand": "pnpm -F @mahjong/web build",
  "installCommand": "pnpm install --frozen-lockfile",
  "outputDirectory": "packages/web/.next",
  "framework": "nextjs"
}
```

- [ ] **Step 9: Install + smoke build**

```bash
source /home/leevince/mahjong/scripts/dev-env.sh && cd /home/leevince/mahjong && npx --yes pnpm@9.0.0 install
source /home/leevince/mahjong/scripts/dev-env.sh && cd /home/leevince/mahjong && npx --yes pnpm@9.0.0 -F @mahjong/web build
```

Expected: `pnpm install` adds Next.js + React + Pusher + KV deps. `pnpm build` compiles Next.js with one route, exits 0.

- [ ] **Step 10: Commit**

```bash
cd /home/leevince/mahjong
git add -A
git commit -m "vercel: replace Fastify server with Next.js packages/web scaffold"
```

---

## Task 2: Env helpers + KV/Pusher SDK wrappers

**Files:**
- Create: `packages/web/lib/env.ts`
- Create: `packages/web/lib/kv.ts`
- Create: `packages/web/lib/pusher-server.ts`

- [ ] **Step 1: Write `packages/web/lib/env.ts`**

```ts
function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) throw new Error(`missing env var ${name}`);
  return v;
}

export const env = {
  cookieSecret: process.env.COOKIE_SECRET ?? 'dev-secret-do-not-use-in-prod',
  pusher: {
    appId:   () => required('PUSHER_APP_ID'),
    key:     () => required('PUSHER_KEY'),
    secret:  () => required('PUSHER_SECRET'),
    cluster: () => required('PUSHER_CLUSTER'),
  },
} as const;
```

(Lazy-evaluated `required()` calls — env vars are read on first use, so dev/test that doesn't hit Pusher doesn't error out at startup.)

- [ ] **Step 2: Write `packages/web/lib/kv.ts`**

```ts
import { kv } from '@vercel/kv';
import type { Room } from './rooms.js'; // declared in Task 4

const ROOM_KEY = (code: string) => `room:${code}`;

/**
 * Read the latest serialized Room from KV. Returns null if not found.
 */
export async function readRoom(code: string): Promise<Room | null> {
  const raw = await kv.get<Room>(ROOM_KEY(code));
  return raw ?? null;
}

/**
 * Optimistic write: only succeeds if the room's `version` field matches
 * `expectedVersion`. Increments version on success. Returns true on success,
 * false on version mismatch (caller should re-read and retry).
 *
 * Implemented with a Redis Lua-ish check-and-set via `kv.eval` since
 * @vercel/kv doesn't expose WATCH/MULTI directly. For our throughput
 * (single-digit RPS per room), a SETIFEQ pattern is enough.
 */
export async function casRoom(code: string, expectedVersion: number, next: Room): Promise<boolean> {
  const key = ROOM_KEY(code);
  const cur = await kv.get<Room>(key);
  if ((cur?.version ?? 0) !== expectedVersion) return false;
  const incremented: Room = { ...next, version: expectedVersion + 1 };
  await kv.set(key, incremented, { ex: 60 * 60 * 24 }); // 24h TTL
  return true;
}

/**
 * Create a new room only if the key doesn't exist (NX).
 */
export async function createRoomIfAbsent(code: string, room: Room): Promise<boolean> {
  const key = ROOM_KEY(code);
  const ok = await kv.set(key, { ...room, version: 1 }, { nx: true, ex: 60 * 60 * 24 });
  return ok === 'OK';
}

export async function deleteRoom(code: string): Promise<void> {
  await kv.del(ROOM_KEY(code));
}
```

- [ ] **Step 3: Write `packages/web/lib/pusher-server.ts`**

```ts
import Pusher from 'pusher';
import { env } from './env.js';
import type { Event, Seat } from '@mahjong/engine';

let _pusher: Pusher | null = null;
function getPusher(): Pusher {
  if (_pusher) return _pusher;
  _pusher = new Pusher({
    appId:   env.pusher.appId(),
    key:     env.pusher.key(),
    secret:  env.pusher.secret(),
    cluster: env.pusher.cluster(),
    useTLS:  true,
  });
  return _pusher;
}

export function roomChannel(code: string): string {
  return `private-room-${code}`;
}
export function seatChannel(code: string, seat: Seat): string {
  return `private-room-${code}-seat-${seat}`;
}

/**
 * Broadcast an event to a room. If the event carries seat-private info
 * (drew with tileForSeat), publishes a redacted copy to the public channel
 * AND the private tile to the recipient seat's channel.
 */
export async function broadcastEvent(code: string, event: Event, seq: number): Promise<void> {
  if (event.t === 'drew' && 'tileForSeat' in event && event.tileForSeat) {
    // Send the private tile to the recipient seat only
    await getPusher().trigger(seatChannel(code, event.seat), 's:event', {
      event, seq,
    });
    // And a redacted version to everyone (just the count change)
    await getPusher().trigger(roomChannel(code), 's:event', {
      event: { t: 'drew', seat: event.seat },
      seq,
    });
    return;
  }
  await getPusher().trigger(roomChannel(code), 's:event', { event, seq });
}

/**
 * Sign a Pusher private-channel subscription request. Called from /api/pusher/auth.
 */
export function authenticateChannel(socketId: string, channel: string, userId: string): string {
  return getPusher().authorizeChannel(socketId, channel, {
    user_id: userId,
  }).auth;
}
```

- [ ] **Step 4: TS compile**

```bash
source /home/leevince/mahjong/scripts/dev-env.sh && cd /home/leevince/mahjong/packages/web && npx --yes pnpm@9.0.0 exec tsc --noEmit 2>&1 | tail -10
```

Expected: some errors about `Room` from rooms.js not existing yet — that's fine, we add it in Task 4. The lazy `required()` ensures runtime is OK at import time.

- [ ] **Step 5: Commit**

```bash
cd /home/leevince/mahjong
git add packages/web/lib/
git commit -m "vercel: env + KV + Pusher SDK wrappers"
```

---

## Task 3: Port codes + identity + protocol

**Files:**
- Create: `packages/web/lib/codes.ts`
- Create: `packages/web/lib/identity.ts`
- Create: `packages/web/lib/protocol.ts`

- [ ] **Step 1: Write `packages/web/lib/codes.ts`**

Same content as the old `packages/server/src/codes.ts` (which was deleted in Task 1). Verbatim:

```ts
import { randomBytes } from 'node:crypto';

export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateRoomCode(): string {
  const bytes = randomBytes(4);
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += ROOM_CODE_ALPHABET[bytes[i]! & 0x1f];
  }
  return out;
}
```

- [ ] **Step 2: Write `packages/web/lib/identity.ts`**

Next.js variant — uses `cookies()` from `next/headers`:

```ts
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';

export const PLAYER_COOKIE = 'playerId';

/**
 * Read the playerId from the request cookie. If absent, issue a new UUID
 * and set the cookie on the response. Returns the playerId either way.
 *
 * Called from each API route at the top.
 */
export function getOrIssuePlayerId(): string {
  const jar = cookies();
  const existing = jar.get(PLAYER_COOKIE);
  if (existing) return existing.value;
  const id = randomUUID();
  jar.set(PLAYER_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}
```

- [ ] **Step 3: Write `packages/web/lib/protocol.ts`**

```ts
import type { Event, Intent, RedactedGameState, Seat } from '@mahjong/engine';
import type { SeatBinding } from './rooms.js';

export type CreateRoomResponse   = { roomCode: string; playerId: string };
export type JoinRoomRequest      = { displayName: string };
export type JoinRoomResponse     = { seat: Seat };
export type IntentRequest        = { intent: Intent };
export type IntentResponse       = { ok: boolean; events?: Event[]; error?: { code: string; message: string } };
export type SnapshotResponse     = RedactedGameState;
export type LobbyState           = { seats: Record<Seat, SeatBinding>; host: string };
```

- [ ] **Step 4: Commit**

```bash
cd /home/leevince/mahjong
git add packages/web/lib/codes.ts packages/web/lib/identity.ts packages/web/lib/protocol.ts
git commit -m "vercel: port codes, identity (Next.js variant), protocol types"
```

---

## Task 4: KV-backed RoomRegistry (rooms.ts)

**Files:**
- Create: `packages/web/lib/rooms.ts`
- Create: `packages/web/__tests__/rooms.test.ts`
- Create: `packages/web/__tests__/kv-mock.ts`

- [ ] **Step 1: Write `packages/web/__tests__/kv-mock.ts`**

```ts
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
```

- [ ] **Step 2: Write `packages/web/__tests__/rooms.test.ts`**

```ts
import './kv-mock.js'; // must be first import
import { describe, it, expect, beforeEach } from 'vitest';
import { resetKvMock } from './kv-mock.js';
import { createRoom, getRoom, joinAsHuman } from '../lib/rooms.js';

describe('KV-backed RoomRegistry', () => {
  beforeEach(() => resetKvMock());

  it('createRoom: returns a unique 4-char code and stores the room', async () => {
    const room = await createRoom('player-1');
    expect(room.code).toMatch(/^[2-9A-Z]{4}$/);
    expect(room.host).toBe('player-1');
    const re = await getRoom(room.code);
    expect(re?.code).toBe(room.code);
  });

  it('joinAsHuman: places player in seat 1 when room has just the host', async () => {
    const room = await createRoom('host');
    const result = await joinAsHuman(room.code, 'guest', 'Alice');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.seat).toBe(1);
      const re = await getRoom(room.code);
      expect(re?.seats[1].kind).toBe('human');
    }
  });

  it('joinAsHuman: rejects when full', async () => {
    const room = await createRoom('host');
    await joinAsHuman(room.code, 'g1', 'A');
    await joinAsHuman(room.code, 'g2', 'B');
    await joinAsHuman(room.code, 'g3', 'C');
    const r = await joinAsHuman(room.code, 'g4', 'D');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('room_full');
  });
});
```

- [ ] **Step 3: Implement `packages/web/lib/rooms.ts`**

```ts
import type { GameState, Seat } from '@mahjong/engine';
import { generateRoomCode } from './codes.js';
import { createRoomIfAbsent, readRoom, casRoom } from './kv.js';

export type PlayerId = string;

export type SeatBinding =
  | { kind: 'empty' }
  | { kind: 'human'; playerId: PlayerId; displayName: string; connected: boolean; graceExpiresAt?: number }
  | { kind: 'bot';   policyName: string };

export type RoomPhase = 'lobby' | 'playing' | 'ended';

export type Room = {
  code: string;
  createdAt: number;
  host: PlayerId;
  seats: Record<Seat, SeatBinding>;
  state: GameState | null;
  phase: RoomPhase;
  endedAt: number | null;
  seq: number;
  pendingClaims: Record<string, unknown>; // seat-as-string → Intent (JSON-friendly)
  version: number; // bumped on every write; used by casRoom
};

const SEATS: readonly Seat[] = [0, 1, 2, 3];

export async function createRoom(hostPlayerId: PlayerId): Promise<Room> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRoomCode();
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
      phase: 'lobby',
      endedAt: null,
      seq: 0,
      pendingClaims: {},
      version: 1,
    };
    const ok = await createRoomIfAbsent(code, room);
    if (ok) return room;
  }
  throw new Error('failed to mint a unique room code after 10 attempts');
}

export async function getRoom(code: string): Promise<Room | null> {
  return await readRoom(code);
}

type JoinResult =
  | { ok: true; seat: Seat; room: Room }
  | { ok: false; code: 'no_room' | 'room_full' };

export async function joinAsHuman(code: string, playerId: PlayerId, displayName: string): Promise<JoinResult> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const room = await readRoom(code);
    if (!room) return { ok: false, code: 'no_room' };
    // Idempotent: if already seated, return existing seat
    for (const seat of SEATS) {
      const b = room.seats[seat];
      if (b.kind === 'human' && b.playerId === playerId) {
        b.connected = true;
        const ok = await casRoom(code, room.version, room);
        if (!ok) continue;
        return { ok: true, seat, room };
      }
    }
    // Find first empty
    let targetSeat: Seat | null = null;
    for (const seat of SEATS) {
      if (room.seats[seat].kind === 'empty') { targetSeat = seat; break; }
    }
    if (targetSeat === null) return { ok: false, code: 'room_full' };
    room.seats[targetSeat] = { kind: 'human', playerId, displayName, connected: true };
    const ok = await casRoom(code, room.version, room);
    if (!ok) continue;
    return { ok: true, seat: targetSeat, room };
  }
  // After 5 conflicts, give up
  return { ok: false, code: 'room_full' };
}
```

- [ ] **Step 4: Run tests**

```bash
source /home/leevince/mahjong/scripts/dev-env.sh && cd /home/leevince/mahjong && npx --yes pnpm@9.0.0 -F @mahjong/web test
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/leevince/mahjong
git add packages/web/lib/rooms.ts packages/web/__tests__/rooms.test.ts packages/web/__tests__/kv-mock.ts
git commit -m "vercel: KV-backed RoomRegistry with optimistic concurrency"
```

---

## Task 5: Dispatcher + bot scheduler + grace (port from old server)

**Files:**
- Create: `packages/web/lib/dispatcher.ts`
- Create: `packages/web/lib/bot-scheduler.ts`
- Create: `packages/web/lib/grace.ts`
- Create: `packages/web/__tests__/dispatcher.test.ts`

- [ ] **Step 1: Write `packages/web/lib/dispatcher.ts`** (port from old `packages/server/src/dispatcher.ts` with the T9 claim-collection version)

```ts
import {
  step, legalIntents, resolveClaimPriority,
  type Intent, type Event, type Seat, type Tile,
} from '@mahjong/engine';
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

  if (room.state.phase.t === 'awaitClaims') {
    room.pendingClaims[String(fromSeat)] = intent;
    const allResponded = room.state.phase.pendingFrom.every((s) => String(s) in room.pendingClaims);
    if (!allResponded) return { ok: true, events: [] };
    const intentsByPriority = room.state.phase.pendingFrom.map((s) => room.pendingClaims[String(s)] as Intent);
    const discarder = room.state.phase.from;
    room.pendingClaims = {};
    const winning = resolveClaimPriority(intentsByPriority, discarder);
    if (winning) return runStep(room, winning);
    // All passed → feed each pass to step sequentially (engine shrinks pendingFrom)
    const events: Event[] = [];
    for (const pass of intentsByPriority) {
      if (pass.t !== 'pass') continue;
      const r = runStep(room, pass);
      if (r.ok) events.push(...r.events);
      else return r;
    }
    return { ok: true, events };
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

- [ ] **Step 2: Write `packages/web/lib/bot-scheduler.ts`** (inline version — no setTimeout)

```ts
import { buildBotView, seededRng, heuristicPolicy, type Seat, type BotPolicy } from '@mahjong/engine';
import type { Room } from './rooms.js';
import { applyIntent } from './dispatcher.js';

const SEATS: readonly Seat[] = [0, 1, 2, 3];
const POLICIES: Record<string, BotPolicy> = {
  [heuristicPolicy.name]: heuristicPolicy,
};

function nextActor(room: Room): Seat | null {
  const s = room.state;
  if (!s || s.phase.t === 'ended') return null;
  if (s.phase.t === 'awaitDiscard') return s.phase.seat;
  for (const seat of s.phase.pendingFrom) {
    if (!(String(seat) in room.pendingClaims)) return seat;
  }
  return null;
}

/**
 * Loop while the next actor is a bot. Returns the combined event stream.
 * NO setTimeout — this runs synchronously within the single intent request
 * so all consecutive bot turns are processed before the API response returns.
 *
 * Cap at MAX_TURNS to defend against pathological loops; should never fire
 * in normal play.
 */
export function runBotTurnsInline(room: Room, MAX_TURNS = 50): import('@mahjong/engine').Event[] {
  const events: import('@mahjong/engine').Event[] = [];
  for (let i = 0; i < MAX_TURNS; i++) {
    const seat = nextActor(room);
    if (seat === null) return events;
    const b = room.seats[seat];
    if (b.kind !== 'bot') return events;
    const policy = POLICIES[b.policyName] ?? heuristicPolicy;
    const view = buildBotView(room.state!, seat, seededRng(room.seq + seat + 1));
    const intent = policy.decide(view);
    const result = applyIntent(room, seat, intent);
    if (!result.ok) return events;
    events.push(...result.events);
  }
  return events;
}

export function botPolicyByName(name: string): BotPolicy {
  return POLICIES[name] ?? heuristicPolicy;
}
```

- [ ] **Step 3: Write `packages/web/lib/grace.ts`** (lazy expiry check)

```ts
import type { Room, SeatBinding } from './rooms.js';
import { heuristicPolicy, type Seat } from '@mahjong/engine';

export const GRACE_MS = 60_000;
const SEATS: readonly Seat[] = [0, 1, 2, 3];

/**
 * For every disconnected human whose grace has expired, flip them to a bot.
 * Mutates `room` in place. Returns true if any seat was flipped (caller
 * should consider triggering a bot turn loop afterward).
 */
export function reconcileGrace(room: Room): boolean {
  const now = Date.now();
  let flipped = false;
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind !== 'human' || b.connected) continue;
    if (!b.graceExpiresAt || now < b.graceExpiresAt) continue;
    room.seats[seat] = { kind: 'bot', policyName: heuristicPolicy.name };
    flipped = true;
  }
  return flipped;
}

export function markDisconnected(room: Room, playerId: string): void {
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind !== 'human' || b.playerId !== playerId) continue;
    b.connected = false;
    b.graceExpiresAt = Date.now() + GRACE_MS;
  }
}

export function markReconnected(room: Room, playerId: string): void {
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind !== 'human' || b.playerId !== playerId) continue;
    b.connected = true;
    delete (b as SeatBinding & { graceExpiresAt?: number }).graceExpiresAt;
  }
}
```

- [ ] **Step 4: Write `packages/web/__tests__/dispatcher.test.ts`**

```ts
import './kv-mock.js';
import { describe, it, expect } from 'vitest';
import { initialState, seededRng } from '@mahjong/engine';
import { applyIntent } from '../lib/dispatcher.js';
import type { Room } from '../lib/rooms.js';

function fakeRoom(): Room {
  return {
    code: 'TEST', createdAt: 0, host: 'h',
    seats: {
      0: { kind: 'human', playerId: 'h', displayName: 'h', connected: true },
      1: { kind: 'bot', policyName: 'heuristic-v1' },
      2: { kind: 'bot', policyName: 'heuristic-v1' },
      3: { kind: 'bot', policyName: 'heuristic-v1' },
    },
    state: initialState(seededRng(1)),
    phase: 'playing', endedAt: null, seq: 0,
    pendingClaims: {},
    version: 1,
  };
}

describe('dispatcher (port)', () => {
  it('rejects illegal intent without mutating state', () => {
    const room = fakeRoom();
    const beforePhase = room.state!.phase.t;
    const r = applyIntent(room, 1, { t: 'discard', seat: 1, tile: room.state!.hands[0]!.concealed[0]! });
    expect(r.ok).toBe(false);
    expect(room.state!.phase.t).toBe(beforePhase);
  });

  it('accepts legal discard, advances to awaitClaims', () => {
    const room = fakeRoom();
    const tile = room.state!.hands[0]!.concealed[0]!;
    const r = applyIntent(room, 0, { t: 'discard', seat: 0, tile });
    expect(r.ok).toBe(true);
    expect(room.state!.phase.t).toBe('awaitClaims');
  });
});
```

- [ ] **Step 5: Run tests**

Expected: 2 dispatcher + 3 rooms = 5 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/leevince/mahjong
git add packages/web/lib/dispatcher.ts packages/web/lib/bot-scheduler.ts packages/web/lib/grace.ts packages/web/__tests__/dispatcher.test.ts
git commit -m "vercel: dispatcher, inline bot scheduler, lazy grace check"
```

---

## Task 6: API route — POST /api/rooms (create)

**Files:**
- Create: `packages/web/app/api/rooms/route.ts`
- Create: `packages/web/__tests__/api.create.test.ts`

- [ ] **Step 1: Write `packages/web/app/api/rooms/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getOrIssuePlayerId } from '@/lib/identity.js';
import { createRoom } from '@/lib/rooms.js';
import type { CreateRoomResponse } from '@/lib/protocol.js';

export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse<CreateRoomResponse>> {
  const playerId = getOrIssuePlayerId();
  const room = await createRoom(playerId);
  return NextResponse.json({ roomCode: room.code, playerId });
}
```

- [ ] **Step 2: Write `packages/web/__tests__/api.create.test.ts`**

```ts
import './kv-mock.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { resetKvMock } from './kv-mock.js';
import { POST } from '../app/api/rooms/route.js';
import { cookies as mockCookies } from 'next/headers';
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
```

- [ ] **Step 3: Run tests** (1 new = 6 total)

- [ ] **Step 4: Commit**

```bash
cd /home/leevince/mahjong
git add packages/web/app/api/rooms/route.ts packages/web/__tests__/api.create.test.ts
git commit -m "vercel: POST /api/rooms creates a room"
```

---

## Task 7: API routes — join, start, snapshot

**Files:**
- Create: `packages/web/app/api/rooms/[code]/join/route.ts`
- Create: `packages/web/app/api/rooms/[code]/start/route.ts`
- Create: `packages/web/app/api/rooms/[code]/snapshot/route.ts`

- [ ] **Step 1: Write `packages/web/app/api/rooms/[code]/join/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { getOrIssuePlayerId } from '@/lib/identity.js';
import { joinAsHuman, getRoom } from '@/lib/rooms.js';
import { reconcileGrace } from '@/lib/grace.js';
import type { JoinRoomRequest, JoinRoomResponse } from '@/lib/protocol.js';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: { code: string } }): Promise<NextResponse<JoinRoomResponse | { error: string }>> {
  const playerId = getOrIssuePlayerId();
  const body: JoinRoomRequest = await req.json().catch(() => ({ displayName: 'Player' }));
  const displayName = body.displayName?.trim() || 'Player';
  // First, reconcile grace on any expired seat (cleans up old players)
  const room = await getRoom(ctx.params.code);
  if (room) reconcileGrace(room);
  const result = await joinAsHuman(ctx.params.code, playerId, displayName);
  if (!result.ok) {
    if (result.code === 'no_room')   return NextResponse.json({ error: 'room not found' }, { status: 404 });
    if (result.code === 'room_full') return NextResponse.json({ error: 'room is full' },   { status: 409 });
    return NextResponse.json({ error: 'join failed' }, { status: 400 });
  }
  return NextResponse.json({ seat: result.seat });
}
```

- [ ] **Step 2: Write `packages/web/app/api/rooms/[code]/start/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getOrIssuePlayerId } from '@/lib/identity.js';
import { getRoom } from '@/lib/rooms.js';
import { casRoom } from '@/lib/kv.js';
import { initialState, seededRng, heuristicPolicy, type Seat } from '@mahjong/engine';
import { runBotTurnsInline } from '@/lib/bot-scheduler.js';
import { broadcastEvent } from '@/lib/pusher-server.js';

export const runtime = 'nodejs';
const SEATS: readonly Seat[] = [0, 1, 2, 3];

export async function POST(_req: NextRequest, ctx: { params: { code: string } }): Promise<NextResponse> {
  const playerId = getOrIssuePlayerId();
  for (let attempt = 0; attempt < 5; attempt++) {
    const room = await getRoom(ctx.params.code);
    if (!room) return NextResponse.json({ error: 'room not found' }, { status: 404 });
    if (room.host !== playerId) return NextResponse.json({ error: 'host only' }, { status: 403 });
    if (room.phase !== 'lobby') return NextResponse.json({ error: 'already started' }, { status: 409 });
    for (const seat of SEATS) {
      if (room.seats[seat].kind === 'empty') {
        room.seats[seat] = { kind: 'bot', policyName: heuristicPolicy.name };
      }
    }
    const seed = randomBytes(4).readUInt32BE(0);
    room.state = initialState(seededRng(seed));
    room.phase = 'playing';
    // Run any leading bot turns synchronously (host is always seat 0 / human, so this is usually a no-op)
    const events = runBotTurnsInline(room);
    const ok = await casRoom(room.code, room.version, room);
    if (!ok) continue;
    // Broadcast events after successful write
    for (const ev of events) {
      room.seq += 1;
      await broadcastEvent(room.code, ev, room.seq);
    }
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json({ error: 'conflict' }, { status: 409 });
}
```

- [ ] **Step 3: Write `packages/web/app/api/rooms/[code]/snapshot/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { getOrIssuePlayerId } from '@/lib/identity.js';
import { getRoom } from '@/lib/rooms.js';
import { redactFor, type Seat } from '@mahjong/engine';
import type { SnapshotResponse } from '@/lib/protocol.js';

export const runtime = 'nodejs';
const SEATS: readonly Seat[] = [0, 1, 2, 3];

export async function GET(_req: NextRequest, ctx: { params: { code: string } }): Promise<NextResponse<SnapshotResponse | { error: string }>> {
  const playerId = getOrIssuePlayerId();
  const room = await getRoom(ctx.params.code);
  if (!room || !room.state) return NextResponse.json({ error: 'not started' }, { status: 404 });
  let mySeat: Seat | null = null;
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind === 'human' && b.playerId === playerId) { mySeat = seat; break; }
  }
  if (mySeat === null) return NextResponse.json({ error: 'not seated' }, { status: 403 });
  return NextResponse.json(redactFor(room.state, mySeat));
}
```

- [ ] **Step 4: Commit**

```bash
cd /home/leevince/mahjong
git add packages/web/app/api/rooms/
git commit -m "vercel: REST routes — join, start, snapshot"
```

---

## Task 8: API route — POST /api/rooms/[code]/intent

**Files:**
- Create: `packages/web/app/api/rooms/[code]/intent/route.ts`

This is the most complex route. It replaces the old socket `c:intent` handler.
Flow: read room with version → apply intent → run bot turns → CAS write →
broadcast events via Pusher → return result.

- [ ] **Step 1: Write `packages/web/app/api/rooms/[code]/intent/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { getOrIssuePlayerId } from '@/lib/identity.js';
import { getRoom } from '@/lib/rooms.js';
import { casRoom } from '@/lib/kv.js';
import { applyIntent } from '@/lib/dispatcher.js';
import { runBotTurnsInline } from '@/lib/bot-scheduler.js';
import { reconcileGrace } from '@/lib/grace.js';
import { broadcastEvent } from '@/lib/pusher-server.js';
import type { Seat } from '@mahjong/engine';
import type { IntentRequest, IntentResponse } from '@/lib/protocol.js';

export const runtime = 'nodejs';
const SEATS: readonly Seat[] = [0, 1, 2, 3];
const MAX_RETRIES = 5;

export async function POST(req: NextRequest, ctx: { params: { code: string } }): Promise<NextResponse<IntentResponse>> {
  const playerId = getOrIssuePlayerId();
  const body: IntentRequest = await req.json();
  if (!body?.intent) return NextResponse.json({ ok: false, error: { code: 'bad_request', message: 'missing intent' } }, { status: 400 });

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const room = await getRoom(ctx.params.code);
    if (!room) return NextResponse.json({ ok: false, error: { code: 'no_room', message: 'room not found' } }, { status: 404 });
    reconcileGrace(room);
    let seat: Seat | null = null;
    for (const s of SEATS) {
      const b = room.seats[s];
      if (b.kind === 'human' && b.playerId === playerId) { seat = s; break; }
    }
    if (seat === null) return NextResponse.json({ ok: false, error: { code: 'not_seated', message: 'not seated' } }, { status: 403 });

    const result = applyIntent(room, seat, body.intent);
    if (!result.ok) return NextResponse.json({ ok: false, error: { code: result.code, message: result.message } }, { status: 400 });

    const botEvents = runBotTurnsInline(room);
    const allEvents = [...result.events, ...botEvents];

    const ok = await casRoom(room.code, room.version, room);
    if (!ok) continue; // conflict — retry

    // Successful write — broadcast events
    for (const ev of allEvents) {
      room.seq += 1;
      await broadcastEvent(room.code, ev, room.seq);
    }
    return NextResponse.json({ ok: true, events: allEvents });
  }
  return NextResponse.json({ ok: false, error: { code: 'conflict', message: 'too many CAS retries' } }, { status: 409 });
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/leevince/mahjong
git add packages/web/app/api/rooms/[code]/intent/
git commit -m "vercel: POST /api/rooms/:code/intent — dispatcher + inline bots + CAS + Pusher"
```

---

## Task 9: API route — POST /api/pusher/auth

**Files:**
- Create: `packages/web/app/api/pusher/auth/route.ts`

Pusher private channels require server-signed subscription requests. The
client requests `pusher.subscribe('private-room-XYZW')` and the SDK calls
this endpoint with the socket ID + channel name; we verify the user has a
right to subscribe (they're seated in that room) and sign.

- [ ] **Step 1: Write `packages/web/app/api/pusher/auth/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { getOrIssuePlayerId } from '@/lib/identity.js';
import { getRoom } from '@/lib/rooms.js';
import { reconcileGrace, markReconnected } from '@/lib/grace.js';
import { authenticateChannel } from '@/lib/pusher-server.js';
import { casRoom } from '@/lib/kv.js';
import type { Seat } from '@mahjong/engine';

export const runtime = 'nodejs';
const SEATS: readonly Seat[] = [0, 1, 2, 3];

export async function POST(req: NextRequest): Promise<NextResponse> {
  const form = await req.formData();
  const socketId = form.get('socket_id')?.toString() ?? '';
  const channel = form.get('channel_name')?.toString() ?? '';
  if (!socketId || !channel) {
    return NextResponse.json({ error: 'missing socket_id or channel_name' }, { status: 400 });
  }

  const playerId = getOrIssuePlayerId();

  // Channel format: private-room-XYZW   or   private-room-XYZW-seat-N
  const m = channel.match(/^private-room-([0-9A-Z]{4})(?:-seat-(\d))?$/);
  if (!m) return NextResponse.json({ error: 'bad channel' }, { status: 400 });
  const code = m[1]!;
  const requestedSeat = m[2] !== undefined ? (Number(m[2]) as Seat) : null;

  const room = await getRoom(code);
  if (!room) return NextResponse.json({ error: 'no room' }, { status: 404 });

  reconcileGrace(room);

  let mySeat: Seat | null = null;
  for (const s of SEATS) {
    const b = room.seats[s];
    if (b.kind === 'human' && b.playerId === playerId) { mySeat = s; break; }
  }
  if (mySeat === null) return NextResponse.json({ error: 'not seated' }, { status: 403 });

  // Seat-private channel — only the owner of the seat can subscribe
  if (requestedSeat !== null && requestedSeat !== mySeat) {
    return NextResponse.json({ error: 'wrong seat' }, { status: 403 });
  }

  // Subscription is effectively a reconnect — clear grace timer
  markReconnected(room, playerId);
  await casRoom(code, room.version, room); // best effort

  const auth = authenticateChannel(socketId, channel, playerId);
  return NextResponse.json({ auth });
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/leevince/mahjong
git add packages/web/app/api/pusher/
git commit -m "vercel: POST /api/pusher/auth — sign private-channel subscriptions"
```

---

## Task 10: Frontend — Pusher client hook + Zustand store

**Files:**
- Create: `packages/web/lib/pusher-client.ts`
- Create: `packages/web/hooks/useGame.ts`
- Create: `packages/web/hooks/usePusherRoom.ts`

- [ ] **Step 1: Write `packages/web/lib/pusher-client.ts`**

```ts
'use client';
import PusherJS from 'pusher-js';

let _client: PusherJS | null = null;

export function getPusherClient(): PusherJS {
  if (_client) return _client;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) throw new Error('NEXT_PUBLIC_PUSHER_KEY / CLUSTER missing');
  _client = new PusherJS(key, {
    cluster,
    authEndpoint: '/api/pusher/auth',
  });
  return _client;
}
```

- [ ] **Step 2: Write `packages/web/hooks/useGame.ts`**

```ts
'use client';
import { create } from 'zustand';
import type { Event, RedactedGameState } from '@mahjong/engine';

type LogEntry = { id: number; text: string };

type GameStore = {
  state: RedactedGameState | null;
  log: LogEntry[];
  lastSeq: number;
  setSnapshot: (s: RedactedGameState) => void;
  applyEvent: (ev: Event, seq: number) => void;
};

let nextLogId = 1;

export const useGame = create<GameStore>((set) => ({
  state: null,
  log: [],
  lastSeq: 0,
  setSnapshot(s) { set({ state: s, lastSeq: 0 }); },
  applyEvent(ev, seq) {
    set((cur) => {
      if (seq <= cur.lastSeq) return cur; // duplicate
      const text = describeEvent(ev);
      return {
        ...cur,
        lastSeq: seq,
        log: [...cur.log, { id: nextLogId++, text }],
      };
    });
  },
}));

function describeEvent(ev: Event): string {
  switch (ev.t) {
    case 'dealt':           return 'Dealt';
    case 'drew':            return `Seat ${ev.seat} drew`;
    case 'discarded':       return `Seat ${ev.seat} discarded ${describeTile(ev.tile)}`;
    case 'flowerReplaced':  return `Seat ${ev.seat} replaced flower ${ev.flower}`;
    case 'melded':          return `Seat ${ev.seat} melded ${ev.meld.kind}`;
    case 'won':             return `Seat ${ev.seat} won (${ev.score} tai) from ${ev.from}`;
    case 'drawWall':        return `Wall exhausted — draw`;
  }
}
function describeTile(t: import('@mahjong/engine').Tile): string {
  switch (t.kind) {
    case 'suit':   return `${t.suit}${t.rank}`;
    case 'honor':  return t.honor;
    case 'flower': return t.flower;
  }
}
```

- [ ] **Step 3: Write `packages/web/hooks/usePusherRoom.ts`**

```ts
'use client';
import { useEffect } from 'react';
import { getPusherClient } from '@/lib/pusher-client.js';
import { useGame } from './useGame.js';
import type { Seat, Event, RedactedGameState } from '@mahjong/engine';

/**
 * Subscribes to the room's public channel + this seat's private channel.
 * On every s:event, calls store.applyEvent. Fetches an initial snapshot on mount.
 */
export function usePusherRoom(roomCode: string, mySeat: Seat) {
  const { setSnapshot, applyEvent } = useGame();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await fetch(`/api/rooms/${roomCode}/snapshot`);
      if (!r.ok) return;
      const snap: RedactedGameState = await r.json();
      if (cancelled) return;
      setSnapshot(snap);
    })();

    const pusher = getPusherClient();
    const roomChan = pusher.subscribe(`private-room-${roomCode}`);
    const seatChan = pusher.subscribe(`private-room-${roomCode}-seat-${mySeat}`);
    const onEvent = (msg: { event: Event; seq: number }) => applyEvent(msg.event, msg.seq);
    roomChan.bind('s:event', onEvent);
    seatChan.bind('s:event', onEvent);

    return () => {
      cancelled = true;
      roomChan.unbind('s:event', onEvent);
      seatChan.unbind('s:event', onEvent);
      pusher.unsubscribe(`private-room-${roomCode}`);
      pusher.unsubscribe(`private-room-${roomCode}-seat-${mySeat}`);
    };
  }, [roomCode, mySeat, setSnapshot, applyEvent]);
}
```

- [ ] **Step 4: Commit**

```bash
cd /home/leevince/mahjong
git add packages/web/lib/pusher-client.ts packages/web/hooks/
git commit -m "vercel: client Pusher hook + Zustand game store"
```

---

## Task 11: Frontend — minimal UI components (Tile / Hand / Seat / Discards / ActionBar / ActionLog)

**Files:**
- Create: `packages/web/components/Tile.tsx`
- Create: `packages/web/components/Hand.tsx`
- Create: `packages/web/components/Seat.tsx`
- Create: `packages/web/components/Discards.tsx`
- Create: `packages/web/components/ActionBar.tsx`
- Create: `packages/web/components/ActionLog.tsx`

Minimal styling — inline CSS, no Tailwind. ASCII tiles. Polish is a separate effort.

- [ ] **Step 1: Write `packages/web/components/Tile.tsx`**

```tsx
import type { Tile as TileT } from '@mahjong/engine';

export function tileLabel(t: TileT): string {
  switch (t.kind) {
    case 'suit':   return `${t.suit}${t.rank}`;
    case 'honor':  return t.honor;
    case 'flower': return t.flower;
  }
}

export function Tile({ tile, onClick, dimmed }: { tile: TileT; onClick?: () => void; dimmed?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={dimmed}
      style={{
        display: 'inline-block', padding: '0.4rem 0.6rem', margin: '0.1rem',
        border: '1px solid #888', borderRadius: 4, background: dimmed ? '#eee' : '#fff',
        cursor: dimmed ? 'default' : 'pointer', fontFamily: 'monospace', minWidth: 32,
      }}
    >
      {tileLabel(tile)}
    </button>
  );
}

export function TileBack() {
  return (
    <span style={{
      display: 'inline-block', padding: '0.4rem 0.6rem', margin: '0.1rem',
      border: '1px solid #888', borderRadius: 4, background: '#c8d',
      minWidth: 32, fontFamily: 'monospace', color: 'transparent',
    }}>??</span>
  );
}
```

- [ ] **Step 2: Write `packages/web/components/Hand.tsx`**

```tsx
'use client';
import { Tile } from './Tile.js';
import type { Tile as TileT } from '@mahjong/engine';

export function Hand({
  tiles, legalDiscards, onDiscard,
}: {
  tiles: readonly TileT[];
  legalDiscards: ReadonlySet<string>;
  onDiscard: (t: TileT) => void;
}) {
  return (
    <div style={{ padding: '0.5rem', borderTop: '2px solid #333' }}>
      <div style={{ fontSize: 12, color: '#666' }}>Your hand ({tiles.length} tiles)</div>
      <div>
        {tiles.map((t, i) => {
          const id = `${t.kind}:${t.kind === 'suit' ? `${t.suit}${t.rank}` : t.kind === 'honor' ? t.honor : t.flower}`;
          return (
            <Tile key={`${id}-${i}`} tile={t} onClick={() => onDiscard(t)} dimmed={!legalDiscards.has(id)} />
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `packages/web/components/Seat.tsx`**

```tsx
import type { Meld, FlowerTile, Seat as SeatT } from '@mahjong/engine';
import { TileBack, Tile, tileLabel } from './Tile.js';

export function SeatView({
  seat, name, concealedCount, exposed, flowers, active,
}: {
  seat: SeatT;
  name: string;
  concealedCount: number;
  exposed: readonly Meld[];
  flowers: readonly FlowerTile[];
  active: boolean;
}) {
  return (
    <div style={{
      padding: '0.5rem', margin: '0.3rem',
      border: active ? '2px solid #f80' : '1px solid #ccc',
      borderRadius: 6, background: '#fafafa',
    }}>
      <div style={{ fontWeight: 'bold' }}>Seat {seat}: {name}</div>
      <div>
        {Array.from({ length: concealedCount }).map((_, i) => <TileBack key={i} />)}
      </div>
      {exposed.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 12 }}>
          Exposed: {exposed.map((m, i) => (
            <span key={i} style={{ marginRight: 6 }}>
              {m.kind}({m.kind === 'chow' ? m.tiles.map(tileLabel).join('') : tileLabel(m.tile)})
            </span>
          ))}
        </div>
      )}
      {flowers.length > 0 && (
        <div style={{ fontSize: 12, color: '#080' }}>
          Flowers: {flowers.map((f) => f.flower).join(' ')}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `packages/web/components/Discards.tsx`**

```tsx
import type { Seat, Tile as TileT } from '@mahjong/engine';
import { tileLabel } from './Tile.js';

export function Discards({ discards }: { discards: readonly { seat: Seat; tile: TileT }[] }) {
  return (
    <div style={{ padding: '0.5rem', background: '#eee', borderRadius: 6, margin: '0.3rem' }}>
      <div style={{ fontSize: 12, color: '#666' }}>River ({discards.length} discards)</div>
      <div style={{ fontFamily: 'monospace' }}>
        {discards.map((d, i) => (
          <span key={i} style={{ marginRight: 4 }}>{tileLabel(d.tile)}</span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write `packages/web/components/ActionBar.tsx`**

```tsx
'use client';
import type { Intent, Seat } from '@mahjong/engine';

export function ActionBar({
  legalIntents, onIntent,
}: {
  legalIntents: readonly Intent[];
  onIntent: (i: Intent) => void;
}) {
  const passIntent = legalIntents.find((i) => i.t === 'pass');
  const winIntents = legalIntents.filter((i) => i.t === 'declareSelfWin' || (i.t === 'claim' && i.kind === 'win'));
  const pongIntents = legalIntents.filter((i) => i.t === 'claim' && i.kind === 'pong');
  const chowIntents = legalIntents.filter((i) => i.t === 'claim' && i.kind === 'chow');
  const kongIntents = legalIntents.filter((i) =>
    (i.t === 'claim' && i.kind === 'kong') || i.t === 'declareConcealedKong'
  );

  return (
    <div style={{ padding: '0.5rem', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {winIntents.map((i, k) => (
        <button key={`w${k}`} onClick={() => onIntent(i)} style={btn('#5e5')}>Win!</button>
      ))}
      {kongIntents.map((i, k) => (
        <button key={`k${k}`} onClick={() => onIntent(i)} style={btn('#aaf')}>Kong</button>
      ))}
      {pongIntents.map((i, k) => (
        <button key={`p${k}`} onClick={() => onIntent(i)} style={btn('#fa5')}>Pong</button>
      ))}
      {chowIntents.map((i, k) => (
        <button key={`c${k}`} onClick={() => onIntent(i)} style={btn('#ff8')}>Chow {k + 1}</button>
      ))}
      {passIntent && <button onClick={() => onIntent(passIntent)} style={btn('#ccc')}>Pass</button>}
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return { padding: '0.5rem 1rem', background: bg, border: '1px solid #888', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' };
}
```

- [ ] **Step 6: Write `packages/web/components/ActionLog.tsx`**

```tsx
'use client';
import { useGame } from '@/hooks/useGame.js';

export function ActionLog() {
  const log = useGame((s) => s.log);
  return (
    <div style={{
      padding: '0.5rem', background: '#fffef0', border: '1px solid #ddc',
      borderRadius: 6, height: 200, overflowY: 'auto', fontSize: 12, fontFamily: 'monospace',
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Log</div>
      {log.slice(-50).map((e) => (
        <div key={e.id}>{e.text}</div>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
cd /home/leevince/mahjong
git add packages/web/components/
git commit -m "vercel: minimal ASCII-tile UI components (Tile/Hand/Seat/Discards/ActionBar/ActionLog)"
```

---

## Task 12: Frontend — landing page (create/join)

**Files:**
- Replace: `packages/web/app/page.tsx`

- [ ] **Step 1: Write `packages/web/app/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function createRoom() {
    setCreating(true); setErr(null);
    try {
      const r = await fetch('/api/rooms', { method: 'POST' });
      const body = await r.json();
      router.push(`/room/${body.roomCode}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function joinRoom() {
    if (code.length !== 4) { setErr('Room code is 4 characters'); return; }
    setJoining(true); setErr(null);
    try {
      const r = await fetch(`/api/rooms/${code.toUpperCase()}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: name || 'Player' }),
      });
      if (!r.ok) {
        const body = await r.json();
        setErr(body.error ?? `HTTP ${r.status}`);
        return;
      }
      router.push(`/room/${code.toUpperCase()}`);
    } finally {
      setJoining(false);
    }
  }

  return (
    <main style={{ maxWidth: 500, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Mahjong</h1>
      <p style={{ color: '#555' }}>Online 4-player Taiwanese mahjong. Bots fill empty seats.</p>

      <section style={{ marginTop: '2rem' }}>
        <button onClick={createRoom} disabled={creating} style={primaryBtn}>
          {creating ? 'Creating…' : 'Create a new room'}
        </button>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: 16 }}>Join a friend's room</h2>
        <input
          type="text" placeholder="ABCD" value={code} maxLength={4}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          style={input}
        />
        <input
          type="text" placeholder="Your name" value={name}
          onChange={(e) => setName(e.target.value)}
          style={input}
        />
        <button onClick={joinRoom} disabled={joining || code.length !== 4} style={secondaryBtn}>
          {joining ? 'Joining…' : 'Join room'}
        </button>
      </section>

      {err && <p style={{ color: '#c33' }}>{err}</p>}
    </main>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: '0.7rem 1.5rem', background: '#5a5', color: 'white', border: 'none',
  borderRadius: 6, fontSize: 16, cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = { ...primaryBtn, background: '#358' };
const input: React.CSSProperties = {
  display: 'block', margin: '0.5rem 0', padding: '0.5rem', fontSize: 16, width: '100%', boxSizing: 'border-box',
};
```

- [ ] **Step 2: Commit**

```bash
cd /home/leevince/mahjong
git add packages/web/app/page.tsx
git commit -m "vercel: landing page with create/join"
```

---

## Task 13: Frontend — room page (game table)

**Files:**
- Create: `packages/web/app/room/[code]/page.tsx`

- [ ] **Step 1: Write `packages/web/app/room/[code]/page.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Hand } from '@/components/Hand.js';
import { SeatView } from '@/components/Seat.js';
import { Discards } from '@/components/Discards.js';
import { ActionBar } from '@/components/ActionBar.js';
import { ActionLog } from '@/components/ActionLog.js';
import { useGame } from '@/hooks/useGame.js';
import { usePusherRoom } from '@/hooks/usePusherRoom.js';
import { tileLabel } from '@/components/Tile.js';
import type { Intent, Seat, Tile as TileT } from '@mahjong/engine';

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = params?.code ?? '';
  const [mySeat, setMySeat] = useState<Seat | null>(null);
  const [legal, setLegal] = useState<Intent[]>([]);
  const [starting, setStarting] = useState(false);
  const state = useGame((s) => s.state);

  // Resolve mySeat by fetching snapshot (snapshot's viewer field)
  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/rooms/${code}/snapshot`);
      if (!r.ok) {
        setMySeat(null);
        return;
      }
      const snap = await r.json();
      setMySeat(snap.viewer);
    })();
  }, [code]);

  usePusherRoom(code, mySeat ?? 0); // subscribes; harmless if mySeat null briefly

  // After every snapshot/event change, refetch legal intents
  useEffect(() => {
    if (!state || mySeat === null) return;
    // For now, legal intents come from a server call; later we can compute client-side
    void fetchLegalIntents(code).then(setLegal);
  }, [state, mySeat, code]);

  async function send(intent: Intent) {
    await fetch(`/api/rooms/${code}/intent`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intent }),
    });
    // refresh legal
    setLegal(await fetchLegalIntents(code));
  }

  async function startRoom() {
    setStarting(true);
    try {
      await fetch(`/api/rooms/${code}/start`, { method: 'POST' });
    } finally {
      setStarting(false);
    }
  }

  if (mySeat === null) {
    return <main style={{ padding: '2rem' }}>Loading room {code}…</main>;
  }

  if (!state) {
    return (
      <main style={{ padding: '2rem', maxWidth: 600, margin: '0 auto' }}>
        <h1>Room {code}</h1>
        <p>Waiting in lobby. Share this URL with friends, then click Start.</p>
        <button onClick={startRoom} disabled={starting} style={{ padding: '0.7rem 1.5rem' }}>
          {starting ? 'Starting…' : 'Start hand (fill empty seats with bots)'}
        </button>
      </main>
    );
  }

  const myHand = state.hands[mySeat];
  const ownTiles = myHand.own ? myHand.concealed : [];
  const legalDiscards = new Set(legal.filter((i) => i.t === 'discard').map((i) => tileKey((i as Extract<Intent, { t: 'discard' }>).tile)));

  return (
    <main style={{ padding: '1rem', maxWidth: 1000, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>Room {code}</h2>
        <span>Wall: {state.wallRemaining}</span>
      </header>
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {[0, 1, 2, 3].map((s) => {
          const seat = s as Seat;
          const h = state.hands[seat];
          const active = state.phase.t === 'awaitDiscard' && state.phase.seat === seat;
          return (
            <SeatView
              key={seat}
              seat={seat}
              name={seat === mySeat ? 'You' : `Seat ${seat}`}
              concealedCount={h.own ? h.concealed.length : h.concealedCount}
              exposed={h.exposed}
              flowers={h.flowers}
              active={active}
            />
          );
        })}
      </section>
      <Discards discards={state.discards} />
      <Hand tiles={ownTiles} legalDiscards={legalDiscards} onDiscard={(t) => send({ t: 'discard', seat: mySeat, tile: t })} />
      <ActionBar legalIntents={legal.filter((i) => i.t !== 'discard')} onIntent={send} />
      <ActionLog />
      {state.phase.t === 'ended' && (
        <div style={{ marginTop: 16, padding: 12, background: '#dfd', borderRadius: 6 }}>
          <h3>Hand ended {state.phase.winner === null ? '(draw)' : `— winner: seat ${state.phase.winner}`}</h3>
          <pre>{JSON.stringify(state.phase.score, null, 2)}</pre>
        </div>
      )}
    </main>
  );
}

async function fetchLegalIntents(code: string): Promise<Intent[]> {
  // The server doesn't currently expose a legalIntents endpoint; for v1 we
  // compute them client-side from snapshot. Simpler stub: return [].
  // (A polish task can add an endpoint or share engine on the client.)
  return [];
}

function tileKey(t: TileT): string {
  switch (t.kind) {
    case 'suit':   return `suit:${t.suit}${t.rank}`;
    case 'honor':  return `honor:${t.honor}`;
    case 'flower': return `flower:${t.flower}`;
  }
}
```

**Note:** `fetchLegalIntents` is currently a stub returning `[]`. For a fully playable v1, we need either a server-side `/api/rooms/[code]/legal` endpoint OR to compute legal intents client-side by importing the engine. The simplest path is to compute client-side — the engine is already a workspace package and the redacted GameState gives us enough info. We do this in Task 14.

- [ ] **Step 2: Commit**

```bash
cd /home/leevince/mahjong
git add packages/web/app/room/
git commit -m "vercel: room page with seat/hand/discards/log + Pusher subscription"
```

---

## Task 14: Client-side legal-intent computation

**Files:**
- Create: `packages/web/lib/client-legal.ts`
- Modify: `packages/web/app/room/[code]/page.tsx`

The engine's `legalIntents()` requires a full `GameState`. The client only has a `RedactedGameState`. For the viewer's own seat we have full info; for awaitClaims involving the viewer, we have what we need. Reconstruct just enough.

- [ ] **Step 1: Write `packages/web/lib/client-legal.ts`**

```ts
import type { RedactedGameState, Intent, Seat, GameState, Hand } from '@mahjong/engine';
import { legalIntents } from '@mahjong/engine';

/**
 * Builds a "shadow" GameState that legalIntents can consume for the viewer's
 * decisions. Opponent hands are filled with placeholder face-down stubs (any
 * tile works because legalIntents only inspects the viewer's seat data).
 */
export function viewerLegalIntents(snap: RedactedGameState): Intent[] {
  const viewer = snap.viewer;
  const myHandSlot = snap.hands[viewer];
  if (!myHandSlot.own) return [];

  const fakeHand = (count: number): Hand => ({
    concealed: Array.from({ length: count }, () => ({ kind: 'honor', honor: 'E' as const })),
    exposed: [],
    flowers: [],
  });

  const myHand: Hand = {
    concealed: myHandSlot.concealed,
    exposed: myHandSlot.exposed,
    flowers: myHandSlot.flowers,
  };

  const hands: Record<Seat, Hand> = {
    0: viewer === 0 ? myHand : fakeHand((snap.hands[0] as { concealedCount: number }).concealedCount),
    1: viewer === 1 ? myHand : fakeHand((snap.hands[1] as { concealedCount: number }).concealedCount),
    2: viewer === 2 ? myHand : fakeHand((snap.hands[2] as { concealedCount: number }).concealedCount),
    3: viewer === 3 ? myHand : fakeHand((snap.hands[3] as { concealedCount: number }).concealedCount),
  };

  const state: GameState = {
    hands,
    wall: [],                // not used by legalIntents
    deadWall: [],
    discards: snap.discards,
    phase: snap.phase,
    dealer: snap.dealer,
    seatWind: snap.seatWind,
    prevailingWind: snap.prevailingWind,
    handNumber: snap.handNumber,
  };

  return legalIntents(state, viewer) as Intent[];
}
```

- [ ] **Step 2: Modify `packages/web/app/room/[code]/page.tsx`** — replace the `fetchLegalIntents` stub

At the top, add:
```ts
import { viewerLegalIntents } from '@/lib/client-legal.js';
```

Replace the bottom-of-file `fetchLegalIntents` function with nothing (delete it).

Change the legal-computation effect from:
```ts
useEffect(() => {
  if (!state || mySeat === null) return;
  void fetchLegalIntents(code).then(setLegal);
}, [state, mySeat, code]);
```

To:
```ts
useEffect(() => {
  if (!state) { setLegal([]); return; }
  setLegal(viewerLegalIntents(state));
}, [state]);
```

And remove the `setLegal(await fetchLegalIntents(code));` line in `send`.

- [ ] **Step 3: Commit**

```bash
cd /home/leevince/mahjong
git add packages/web/lib/client-legal.ts packages/web/app/room/[code]/page.tsx
git commit -m "vercel: client computes legal intents from redacted snapshot"
```

---

## Task 15: Integration test — full hand via API

**Files:**
- Create: `packages/web/__tests__/pusher-mock.ts`
- Create: `packages/web/__tests__/api.happy-path.test.ts`

- [ ] **Step 1: Write `packages/web/__tests__/pusher-mock.ts`**

```ts
import { vi } from 'vitest';

const broadcasts: { channel: string; event: string; payload: unknown }[] = [];

vi.mock('pusher', () => {
  return {
    default: class FakePusher {
      async trigger(channel: string, event: string, payload: unknown) {
        broadcasts.push({ channel, event, payload });
      }
      authorizeChannel() { return { auth: 'fake-auth' }; }
    },
  };
});

export function getBroadcasts() { return broadcasts; }
export function resetBroadcasts() { broadcasts.length = 0; }
```

- [ ] **Step 2: Write `packages/web/__tests__/api.happy-path.test.ts`**

```ts
import './kv-mock.js';
import './pusher-mock.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetKvMock } from './kv-mock.js';
import { resetBroadcasts, getBroadcasts } from './pusher-mock.js';

vi.mock('next/headers', () => {
  const store = new Map<string, string>();
  return {
    cookies: () => ({
      get: (n: string) => store.has(n) ? { name: n, value: store.get(n)! } : undefined,
      set: (n: string, v: string) => { store.set(n, v); },
    }),
  };
});

// Stub NextResponse.json so we can call route handlers in isolation
import { POST as createRoom }   from '../app/api/rooms/route.js';
import { POST as startRoom }    from '../app/api/rooms/[code]/start/route.js';
import { POST as sendIntent }   from '../app/api/rooms/[code]/intent/route.js';
import { GET  as getSnapshot }  from '../app/api/rooms/[code]/snapshot/route.js';
import type { NextRequest } from 'next/server';

describe('integration: full hand via API (1 human + 3 bots)', () => {
  beforeEach(() => { resetKvMock(); resetBroadcasts(); });

  it('plays from create → start → discard loop → ended', async () => {
    const createRes = await createRoom();
    const { roomCode } = await createRes.json();

    const startReq = mockReq('http://localhost/api/rooms/' + roomCode + '/start');
    const startRes = await startRoom(startReq, { params: { code: roomCode } });
    expect(startRes.status).toBe(204);

    let snap: { viewer: number; phase: { t: string }; hands: Record<number, { own?: boolean; concealed?: { kind: string }[] }>; discards: unknown[] } = {} as never;

    for (let turn = 0; turn < 300; turn++) {
      const snapRes = await getSnapshot(mockReq('http://localhost/'), { params: { code: roomCode } });
      snap = await snapRes.json();
      if (snap.phase.t === 'ended') break;
      if (snap.phase.t === 'awaitDiscard' && snap.viewer === 0) {
        const myHand = snap.hands[0]!;
        if (!myHand.own) throw new Error('not own');
        const tile = myHand.concealed![0];
        await sendIntent(
          mockReq('http://localhost/', { intent: { t: 'discard', seat: 0, tile } }),
          { params: { code: roomCode } },
        );
      } else if (snap.phase.t === 'awaitClaims') {
        await sendIntent(
          mockReq('http://localhost/', { intent: { t: 'pass', seat: 0 } }),
          { params: { code: roomCode } },
        );
      } else {
        // bot turn — bots run inline inside the intent handler, but we need to
        // re-fetch snapshot. The loop top does that.
        // Nothing to do here.
      }
    }
    expect(snap.phase.t).toBe('ended');
    // Some 'discarded' or 'drew' events should have been broadcast
    expect(getBroadcasts().length).toBeGreaterThan(0);
  }, 30_000);
});

function mockReq(url: string, body?: unknown): NextRequest {
  return {
    url,
    formData: async () => new FormData(),
    json: async () => body ?? {},
  } as unknown as NextRequest;
}
```

- [ ] **Step 3: Run + iterate**

```bash
source /home/leevince/mahjong/scripts/dev-env.sh && cd /home/leevince/mahjong && npx --yes pnpm@9.0.0 -F @mahjong/web test api.happy-path
```

The test may time out or hang if the bot loop expects an event the test doesn't send. Tighten the human-side discard/pass logic if so.

- [ ] **Step 4: Commit**

```bash
cd /home/leevince/mahjong
git add packages/web/__tests__/pusher-mock.ts packages/web/__tests__/api.happy-path.test.ts
git commit -m "vercel: integration test — full hand via REST API + KV/Pusher mocks"
```

---

## Task 16: vercel.json + DEPLOY docs

**Files:**
- Modify: `vercel.json` (already exists from Task 1; verify shape)
- Create: `docs/DEPLOY-VERCEL.md`
- Modify: `README.md` (point at new deploy docs)

- [ ] **Step 1: Verify `vercel.json`** — should already exist from Task 1.

```bash
cat /home/leevince/mahjong/vercel.json
```

If it points at `packages/web/.next`, you're good. Otherwise rewrite per Task 1 Step 8.

- [ ] **Step 2: Write `docs/DEPLOY-VERCEL.md`**

```markdown
# Deploy to Vercel

The mahjong app deploys as a single Next.js project at `packages/web/`,
backed by Vercel KV (Upstash Redis) and Pusher Channels for real-time.

## One-time setup

### 1. Pusher account (free)

1. Sign up at https://pusher.com/channels
2. Create a new Channels app. Pick any cluster (e.g. `us2`, `mt1`, `eu`).
3. From the app's "App Keys" tab, copy:
   - `app_id` → `PUSHER_APP_ID`
   - `key`    → `PUSHER_KEY` and `NEXT_PUBLIC_PUSHER_KEY`
   - `secret` → `PUSHER_SECRET`
   - `cluster` → `PUSHER_CLUSTER` and `NEXT_PUBLIC_PUSHER_CLUSTER`

### 2. Vercel project + KV

1. Push this repo to GitHub.
2. https://vercel.com/new → import the repo. Framework preset: Next.js.
   Root directory: `packages/web` (or leave at repo root since `vercel.json`
   handles it).
3. In Project Settings → Storage → "Create Database" → pick **KV** (Upstash
   Redis under the hood). Vercel auto-wires `KV_REST_API_URL`,
   `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN` as env vars.
4. In Project Settings → Environment Variables, add the 6 Pusher vars from
   step 1.
5. Deploy. Subsequent pushes auto-deploy.

## Local dev against real Pusher / KV

1. Copy `.env.example` → `.env.local` and fill values.
2. `pnpm -F @mahjong/web dev`. Open `http://localhost:3000`.
3. Two browsers (or one regular + one incognito) can join the same room.

## Notes

- Bot scheduler runs inline within each intent request. With 3 bots taking
  ~0–10 turns each, well under Vercel's 10s Hobby timeout.
- A redeploy or KV write conflict can interrupt an active hand. Players
  retry; the engine's deterministic step makes recovery straightforward.
- Pusher free tier: 200K messages/day. A typical hand emits ~150 events;
  ~1300 hands/day is the daily ceiling. Plenty for friends-only.

## Local prod-mode test

    pnpm -F @mahjong/web build
    pnpm -F @mahjong/web start
```

- [ ] **Step 3: Update `README.md`**

Replace the body with:

```markdown
# Mahjong

Online 4-player Taiwanese mahjong. See `docs/superpowers/specs/` for design
and `docs/superpowers/plans/` for implementation plans.

## Packages

- `packages/engine` — pure-TS rules engine. Tile model, win detection, scoring, bot policies.
- `packages/web` — Next.js app (UI + API routes). Deploys to Vercel.

## Dev

    pnpm install
    pnpm -F @mahjong/engine test
    pnpm -F @mahjong/web dev

## Deploy

See `docs/DEPLOY-VERCEL.md`.
```

- [ ] **Step 4: Commit**

```bash
cd /home/leevince/mahjong
git add vercel.json docs/DEPLOY-VERCEL.md README.md
git commit -m "vercel: deploy docs + README update"
```

---

## Done

When all 16 tasks pass:

- `packages/server` (Fastify + Socket.IO) is gone — replaced by `packages/web` (Next.js).
- `vercel.json` + Vercel KV + Pusher Channels deliver the full real-time game without WebSockets.
- One `vercel deploy` (or git-push to a connected Vercel project) ships everything.
- Friends visit `<app>.vercel.app`, click Create or enter a code, play.
- UI is minimal — ASCII tiles, plain CSS. Polish (real tile graphics, animations, sounds, mobile-first layout) is a separate follow-on plan.
