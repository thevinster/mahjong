# Plan: Make Mahjong playable (single-player + multiplayer + disconnect→bot)

**Goal**: A user can Create a room → see a live lobby → click Start → play a full hand against bots (solo) or other humans (multiplayer), with the board advancing in real time; a human who leaves is replaced by a bot after a 60s grace.

**Architecture**: Next.js 14 App Router on Vercel; Pusher Channels for realtime; Vercel KV for state with optimistic CAS. The server (`@mahjong/engine` + API routes) is the single source of truth; the client renders a per-seat **redacted snapshot** and **refetches the snapshot on every realtime push** (client-side reduction is impossible on redacted state).

**Tech Stack**: TypeScript (strict), Next.js, Zustand, pusher / pusher-js, @vercel/kv, Jest.

---

## Background — bugs this fixes (confirmed in source)

1. **Lobby deadlock (reported hang).** The room page resolves the viewer's seat *only* from `GET /snapshot`, but that route returns `404` whenever `room.state` is null — i.e. always, in the lobby. The page then renders `"Loading room…"` and the host-only **Start** button (which lives behind that guard) is never reachable. Blocks *both* single-player and multiplayer.
2. **Frozen board.** `useGame.applyEvent` only appends to the action log; it never updates `state`. `state` is set once by `setSnapshot` on mount and then never changes. The board would never advance even after a successful start.
3. **Seat-channel mis-subscription.** `usePusherRoom(code, mySeat ?? 0)` subscribes to seat-0's private channel before the viewer's seat is known; the Pusher auth route correctly 403s non-owners, so it's spurious console noise (not a leak), but it's wrong.
4. **Inert disconnect handling.** `markDisconnected` is never called anywhere, and nothing advances the game when an absent human is on turn, so the "60s → bot" takeover never happens.

---

## Design

### A. Unified snapshot endpoint — `GET /api/rooms/[code]/snapshot`
Returns one shape that serves both lobby and game:

```ts
// lib/protocol.ts
export type SeatPublic = {
  seat: Seat;
  kind: 'empty' | 'human' | 'bot';
  name: string | null;     // displayName for humans, 'Bot' for bots, null for empty
  connected: boolean;      // humans only; bots/empty => false
};
export type RoomSnapshot = {
  code: string;
  phase: 'lobby' | 'playing' | 'ended';
  viewerSeat: Seat | null; // viewer's seat; null if not joined (direct-URL visitor)
  isHost: boolean;
  seq: number;             // server room.seq, for the client's staleness guard
  seats: SeatPublic[];     // PUBLIC roster — never contains playerIds
  state: RedactedGameState | null; // per-seat redacted; null in lobby / for non-seated
};
export type SnapshotResponse = RoomSnapshot;
```

- Lobby (`state===null`) does **not** 403 for non-seated viewers — anyone with the code may see the roster.
- Game `state` is attached only when a hand is running **and** the viewer occupies a seat (redaction needs a seat). Non-seated viewer mid-game gets `state:null`.

Builder lives in `lib/snapshot.ts`:
```ts
export function buildRoomSnapshot(room: Room, playerId: string): RoomSnapshot
```

### B. Client store + render-by-phase
- `useGame` holds `snapshot: RoomSnapshot | null` (replaces `state`), plus `log`, `lastSeq`, `snapshotSeq`.
- `setSnapshot(s)` ignores `s` if `s.seq < snapshotSeq` (staleness guard); else replaces and sets `snapshotSeq`.
- `applyEvent(ev, seq)` unchanged (action log only).
- Room page renders **Lobby** when `phase==='lobby'`, otherwise **Game**, reading everything from the one snapshot (no separate mySeat fetch).

### C. Realtime wiring
- Subscribe to the **room channel always**; subscribe to the **seat channel only when `viewerSeat !== null`**.
- New realtime signal `s:lobby` (room channel) = "room changed, refetch". Game progress keeps using `s:event`.
- Client refetches the snapshot on **either** `s:event` or `s:lobby`.
- `join` broadcasts `s:lobby` → live roster.
- `start` broadcasts `s:lobby` **unconditionally** (the first turn is the human dealer, so `runBotTurnsInline` may yield zero events — without this ping, other lobby clients would never learn the hand began).

### D. Lobby UI (`components/Lobby.tsx`)
Roster (`You` / name / `empty → bot`, with a • for connected), a **share the code** hint, a host-only **Start hand** button, and an inline **Join** (name + button) shown when `viewerSeat===null`.

### E. Single-player
Emerges from the chosen flow with no new endpoint: Create → lobby (seat 0 = you, 1–3 `empty → bot`) → Start → bots fill → solo game.

### F. Disconnect → bot
- **Trigger**: room page sends `navigator.sendBeacon('/api/rooms/[code]/leave')` on `pagehide`. New `POST /leave` calls `markDisconnected(room, playerId)` + CAS + `s:lobby`.
- **Advance**: new `POST /tick` — read room → `reconcileGrace` (flip grace-expired disconnected humans → bots) → if anything is now pending for a bot, `runBotTurnsInline` → on change, CAS + broadcast events + `s:lobby`; otherwise `204` (cheap no-op).
- **Driver**: while `phase==='playing'` and the **active seat is a human flagged `connected:false`**, the room page polls `/tick` every 8s. This is the only condition that can stall (a present human's turn waits for them; bot turns already run inline). Minimises KV/Pusher load.
- **Reconnect**: Pusher auth already calls `markReconnected` on (re)subscribe, clearing the grace timer.

---

## Tasks (TDD)

| Group | Steps | Parallel | Files |
|------|-------|----------|-------|
| 1 | 1 protocol types, 2 snapshot builder | Yes | `lib/protocol.ts`, `lib/snapshot.ts` |
| 2 | 3 snapshot route, 4 lobby broadcast, 5 join+start ping | No (dep G1) | route + `lib/pusher-server.ts` |
| 3 | 6 leave route, 7 tick route | Yes | new routes |
| 4 | 8 store, 9 pusher hook | No (dep G1) | hooks |
| 5 | 10 Lobby component, 11 room page rewrite | No (dep G2,G4) | components/app |
| 6 | 12 end-to-end test + manual smoke | No | `__tests__` |

### Step 1 — protocol types
Add `SeatPublic`, `RoomSnapshot`; set `SnapshotResponse = RoomSnapshot`.

### Step 2 — `lib/snapshot.ts` `buildRoomSnapshot`
Map seats → `SeatPublic[]` (no playerIds); resolve `viewerSeat`/`isHost`; attach `redactFor(room.state, viewerSeat)` only when `state && viewerSeat!==null`. Test: lobby → `state:null`+roster; playing+seated → `state` present; non-seated mid-game → `state:null`.

### Step 3 — snapshot route
Return `buildRoomSnapshot(room, playerId)`; `404` only when the room itself is absent. No seating 403.

### Step 4 — `broadcastLobby(code, seq)`
Trigger `s:lobby` `{ seq }` on the room channel.

### Step 5 — join + start ping
`join` broadcasts `s:lobby` after success. `start` broadcasts `s:lobby` after the CAS write (in addition to game events).

### Step 6 — `POST /leave`
`markDisconnected` + CAS + `broadcastLobby`. Tolerate empty body (sendBeacon). Return `204`.

### Step 7 — `POST /tick`
`reconcileGrace` → conditional `runBotTurnsInline` → CAS + broadcast (events + `s:lobby`) on change, else `204`. Test: disconnected human on turn with expired grace → tick flips to bot and advances `seq`.

### Step 8 — `useGame` store
Hold `snapshot`; `setSnapshot` seq-guarded; keep `applyEvent`.

### Step 9 — `usePusherRoom`
Room channel always; seat channel when `viewerSeat!==null`; refetch snapshot on `s:event`/`s:lobby`; fetch once on mount.

### Step 10 — `Lobby.tsx`
Roster + share hint + host Start + inline join.

### Step 11 — room page rewrite
Render by `phase`; start/send handlers (send refetches after POST); `pagehide` beacon; conditional tick interval.

### Step 12 — end-to-end
Jest: create → start → human discard → snapshot reflects new discard + advanced turn (proves Bug 2). Manual: `pnpm dev`, click through solo + (two browser profiles) multiplayer.

---

## Out of scope / follow-ups
- Real tile graphics, animations, sounds, mobile layout.
- Presence-channel-based disconnect (cleaner than beacon+tick) if Pusher webhooks are configured.
- Spectator (non-seated) live game view.

## Commands
- Engine tests: `pnpm -F @mahjong/engine test` (91 must stay green)
- Web tests: `pnpm -F @mahjong/web test`
- Typecheck/build: `pnpm -F @mahjong/engine exec tsc -b --force && pnpm -F @mahjong/web build`
- Dev: `pnpm -F @mahjong/web dev` (env via `source scripts/dev-env.sh` first)
