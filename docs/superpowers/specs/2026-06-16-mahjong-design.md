# Online Mahjong — v1 Design

Date: 2026-06-16
Status: Draft, pending implementation plan

## 1. Goal & scope

Build a browser-based, real-time, 4-player Taiwanese mahjong game in the
"jackbox" mold: the host runs the server on their laptop, creates a room,
shares a 4-character code, and friends join from anywhere with that code.
Empty seats are filled by bots. v1 is a single hand per room.

Out of scope for v1: persistent accounts, leaderboards, matchmaking,
multi-hand matches, public hosting, mobile-app shells, special-pattern hands
beyond the basic 5-melds-and-pair win.

## 2. Decisions locked in during brainstorming

| Decision | Value |
|----------|-------|
| Deployment | Fly.io free tier (3× shared-cpu-1x VMs, 256MB). Host gets a public `<app>.fly.dev` URL; friends join via URL + room code. Dev runs on macOS/Linux Node; prod runs in Fly's Linux containers. In-memory rooms still acceptable because rooms are single-hand — a redeploy drops active rooms, same as a restart. |
| Tech stack | Node.js + TypeScript full-stack |
| Rule scope | Standard Taiwanese: 16-tile hand, pong + chow + kong, flowers, basic taai scoring |
| Bot AI | Heuristic "competent beginner"; pluggable `BotPolicy` interface for future replacement |
| UI polish | Full polish — tile graphics, animations, sounds, mobile-first responsive |
| Match length | Single hand per room; room reaped 5 min after end-of-hand |
| Disconnects | 60-second grace period, then bot takes over the seat |
| Turn timing | No turn or claim timers for humans; explicit Pass buttons gate claim windows. (The 60s disconnect grace timer in §6.3 is unrelated — it's about network presence, not gameplay pace.) |
| Social features | Active-player indicator + side-panel action log only — no chat, no spectators, no emotes |
| Architecture | pnpm monorepo: `engine` (pure rules) + `server` (Fastify + Socket.IO) + `client` (React + Vite + Tailwind + Framer Motion) |

## 3. Repository layout

```
mahjong/
  package.json                    # workspace root, scripts: dev / build / test
  pnpm-workspace.yaml
  tsconfig.base.json              # strict TS, shared
  packages/
    engine/                       # pure logic; no I/O, DOM, or sockets
      src/
        tiles.ts                  # tile model, deck, sort order
        hand.ts                   # hand state + concealed/exposed/flowers slices
        meld.ts                   # pong/chow/kong/pair types + builders
        rules.ts                  # legal-move generator, claim priority
        win.ts                    # win-pattern detector (5 melds + pair)
        score.ts                  # basic taai scoring
        game.ts                   # GameState reducer: (state, intent) -> (state, events[])
        bot/
          policy.ts               # BotPolicy interface
          heuristic.ts            # competent-beginner implementation
          random.ts               # random-legal-move policy (test baseline)
        events.ts                 # discriminated union of all game events
      tests/                      # vitest, runs in node
    server/
      src/
        index.ts                  # Fastify bootstrap; serves built client + sockets
        rooms.ts                  # in-memory Room registry, codes, lifecycle, GC
        socket.ts                 # Socket.IO handlers; wire <-> engine intent/event
        identity.ts               # playerId issuance + reconnect binding
      tests/
    client/
      src/
        main.tsx
        routes/
          landing.tsx             # create / join room
          room.tsx                # game table; renders lobby/play/end by phase
        components/
          Tile.tsx
          Hand.tsx
          Seat.tsx
          Discards.tsx
          ActionBar.tsx
          ActionLog.tsx
          EndOfHandModal.tsx
        net/socket.ts             # typed Socket.IO client
        store/game.ts             # Zustand store mirroring redacted GameState
        animations.ts             # Framer Motion variants
        sound.ts                  # Howler.js cues, event-driven
      public/
        tiles/                    # SVG sprite sheet (Wikimedia CC-BY-SA tiles)
        sounds/                   # CC0/CC-BY cues
      index.html
      vite.config.ts
  docs/
    superpowers/
      specs/                      # this file lives here
```

**Boundary rules:**

- `engine` imports nothing outside itself. Same code runs in tests, in the
  server (authoritative), and in the client (types and optimistic legal-move
  highlighting only — never as a source of truth).
- `server` is the *only* writer of `GameState`. Clients submit *intents*;
  the server runs them through `engine` and broadcasts events.
- `client` is a reducer over the server's event stream. It never invents a
  state transition on its own.

## 4. Engine

### 4.1 Tile model

```ts
type Suit = 'm' | 'p' | 's';                      // man / pin / sou
type Honor = 'E' | 'S' | 'W' | 'N'                // winds
           | 'R' | 'G' | 'Wh';                    // dragons
type Flower = 'F1'|'F2'|'F3'|'F4'|'S1'|'S2'|'S3'|'S4';

type SuitTile   = { kind: 'suit';   suit: Suit; rank: 1|2|3|4|5|6|7|8|9 };
type HonorTile  = { kind: 'honor';  honor: Honor };
type FlowerTile = { kind: 'flower'; flower: Flower };
type Tile = SuitTile | HonorTile | FlowerTile;
```

Deck = 4× each suit/honor + 1× each flower = 144 tiles. `tileId(t)` returns
a stable string key for sorting and equality.

### 4.2 Hand

```ts
type Meld =
  | { kind: 'chow'; tiles: [SuitTile, SuitTile, SuitTile]; claimedFrom?: Seat }
  | { kind: 'pong'; tile: Tile; claimedFrom?: Seat }
  | { kind: 'kong'; tile: Tile; concealed: boolean; claimedFrom?: Seat };

type Hand = {
  concealed: Tile[];          // sorted; 16 between turns, 17 just after draw
  exposed: Meld[];            // pong/chow/kong called from a discard
  flowers: FlowerTile[];      // set aside; count toward taai
};
```

### 4.3 Game state

```ts
type Seat = 0 | 1 | 2 | 3;

type Phase =
  | { t: 'awaitDiscard'; seat: Seat }
  | { t: 'awaitClaims';  discard: Tile; from: Seat; pendingFrom: Seat[] }
  | { t: 'ended';        winner: Seat | null; score: Record<Seat, number> };

type GameState = {
  hands: Record<Seat, Hand>;
  wall: Tile[];
  deadWall: Tile[];                          // 14 tiles; replacement source for kong & flower
  discards: { seat: Seat; tile: Tile }[];    // chronological river
  phase: Phase;
  dealer: Seat;                              // always seat 0 in single-hand rooms; dealer = East
  seatWind: Record<Seat, 'E'|'S'|'W'|'N'>;   // assigned in join order: seat 0=E, 1=S, 2=W, 3=N
  prevailingWind: 'E';                       // single-hand → always East
  handNumber: 1;
};
```

### 4.4 Intents & events

```ts
type Intent =
  | { t: 'discard';               seat: Seat; tile: Tile }
  | { t: 'claim';                 seat: Seat; kind: 'pong'|'chow'|'kong'|'win'; tiles: Tile[] }
  | { t: 'pass';                  seat: Seat }
  | { t: 'declareSelfWin';        seat: Seat }
  | { t: 'declareConcealedKong';  seat: Seat; tile: Tile };

type Event =
  | { t: 'dealt' }
  | { t: 'drew';            seat: Seat; tileForSeat?: Tile }   // tile hidden from others
  | { t: 'discarded';       seat: Seat; tile: Tile }
  | { t: 'flowerReplaced';  seat: Seat; flower: FlowerTile; replacement?: Tile }
  | { t: 'melded';          seat: Seat; meld: Meld }
  | { t: 'won';             seat: Seat; from: Seat | 'self'; score: number; breakdown: TaiItem[] }
  | { t: 'drawWall' };                                          // wall exhausted, no winner
```

### 4.5 Win detection

Given 17 tiles (concealed + drawn + claimed), return all valid partitions
into `5 melds + 1 pair`. Recursive backtracking: pick a candidate pair, then
greedy/backtracking assignment of chow/pong per suit. Honors are pong-only
(no chow). Memoize on sorted tile-multiset signature. Returns **all** valid
decompositions because scoring may prefer one over another. The detector
also records the drawn-or-claimed tile separately so self-draw vs ron taai
can be computed.

### 4.6 Legal-move generator

`legalIntents(state, seat) → Intent[]` is the single source of truth for
what each seat can do right now. Used by:

- server to validate incoming intents (illegal → `s:error`, no state change);
- client to enable/disable buttons in `ActionBar`;
- bot policy as its input.

### 4.7 Claim resolution

When a tile is discarded, `phase` becomes `awaitClaims` and lists every
seat that *might* claim it. Each pending seat must respond with `claim` or
`pass`. Once all responses are in (humans click; bots respond synchronously
via `decide`), the engine resolves by Taiwanese priority:

1. **Win** — multiple winners resolved by head-bump in turn order from the
   discarder.
2. **Kong / Pong** — at most one claimer is possible (4-of-a-kind in one hand).
3. **Chow** — only the next player in turn order is eligible.

If no one claims, the next player draws.

### 4.8 Flowers

A flower drawn from the wall is moved to `hand.flowers` immediately, and
a replacement is drawn from the **dead wall** tail. If the replacement is
also a flower, repeat until non-flower. Emitted as `flowerReplaced` so
the client can animate.

### 4.9 RNG injection

`shuffle(deck, rng)` takes `rng: () => number` (Math.random-compatible,
returns `[0, 1)`). Production server seeds from `crypto.randomBytes`;
tests use fixed seeds for reproducible failures.

### 4.10 Out of scope for v1

- Special-pattern hands (big four winds, all honors, seven pairs, etc.)
- `pao` / responsibility rules
- Riichi (Japanese)
- Abortive draws beyond wall-exhaustion

## 5. Bot policy

### 5.1 Interface

```ts
type BotPolicy = {
  name: string;
  decide(view: BotView): Intent;        // synchronous, must return a legal intent
};

type BotView = {
  seat: Seat;
  myHand: Hand;
  myConcealedKongs: Tile[];
  opponents: Record<Seat, OpponentView>;     // counts + exposed + flowers only
  discards: { seat: Seat; tile: Tile }[];
  wallRemaining: number;
  phase: Phase;
  legalIntents: Intent[];                    // from engine
  rng: () => number;                         // deterministic tie-breaking in tests
};
```

`BotView` is built by the engine from `GameState` minus other players'
concealed tiles. **Same redaction code path** the server uses for per-seat
state broadcast — no risk of an information leak via the bot interface.

### 5.2 Decision flow

`decide` switches on `phase.t`:

- `awaitDiscard` (it's my turn): pick worst tile to discard.
- `awaitClaims` (I'm in `pendingFrom`): choose `win` / `kong` / `pong` /
  `chow` / `pass` from `legalIntents`.
- `awaitDiscard` and a self-win is legal: prefer it.

### 5.3 Heuristic — "competent beginner"

**Shanten estimate.** `shanten(hand) → number` = tile-swaps away from a
complete 5-melds-and-pair. Standard recursion over (suits, melds-formed,
partials, pair-formed). Cached on tile-multiset key. Dominant signal: any
action that decreases shanten is preferred; any that increases it is
rejected unless it wins.

**Discard scoring.** For each candidate tile to discard:

- `shantenIfRemoved` (primary, lower is better)
- `tileValue` (pairs/runs nearby > isolated; honors isolated unless ≥2)
- `dangerScore` (opponents with exposed melds in this suit; small penalty
  for middle tiles 3–7 in mid-late game)
- Pick `argmin(shantenIfRemoved, -tileValue, dangerScore)`.

**Claim decisions.**

- **Win:** always take it.
- **Kong:** take if it doesn't worsen shanten *and* you already have the
  pong exposed, or if it gets you to shanten 0.
- **Pong:** take if shanten strictly decreases, or if shanten ≤1 and the
  ponged tile is an honor/terminal (otherwise dead weight).
- **Chow:** take if shanten strictly decreases.
- Otherwise **pass**. Heuristic skews defensive — over-claiming exposes
  the hand and reduces flexibility (a common beginner mistake we avoid).

**Tie-breaking.** Use `view.rng()` for reproducibility in tests.

### 5.4 Random policy

Also ships, in `bot/random.ts`. Picks uniformly from `legalIntents`
(including `win` when it appears — random play wins are rare enough not
to skew fuzz coverage). Used for: (a) smoke test that the engine never
stalls; (b) property fuzz harness (thousands of random-vs-random hands
to assert invariants).

### 5.5 Server integration

Bot-owned seats get a jittered 400–900ms delay before `decide` is invoked
so play doesn't feel uncannily instant. Delay is a single `setTimeout` in
the seat-action dispatcher, not inside the policy.

### 5.6 Pluggability

Server holds `Map<Seat, BotPolicy>`, configured at room creation. Future
stronger bots (search, learned) just export another `BotPolicy` — no
other code changes.

## 6. Server

The server is one Node process. Fastify serves the built client + REST
endpoints. Socket.IO handles in-game traffic. All state lives in process
memory; **a restart drops every room** — accepted because rooms are
single-hand and friends-only.

### 6.1 Room lifecycle

```ts
type Room = {
  code: string;                              // 4 chars, alphabet below
  createdAt: number;
  host: PlayerId;
  seats: Record<Seat, SeatBinding>;          // always 4
  state: GameState | null;                   // null until host starts
  policies: Record<Seat, BotPolicy | null>;  // non-null for bot seats
  graceTimers: Record<Seat, NodeJS.Timeout | null>;
};

type SeatBinding =
  | { kind: 'empty' }
  | { kind: 'human'; playerId: PlayerId; displayName: string; connected: boolean }
  | { kind: 'bot';   policyName: string };
```

States: `Lobby → Playing → Ended → (TTL 5 min) → Reaped`. The end-state
lingers so players see the final score and action log before the room
evaporates.

### 6.2 Room codes

4 chars from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (32-char alphabet, no
visually-ambiguous 0/O/1/I). On collision with a live or recently-reaped
code, retry. With ~1M code space and ≤100 concurrent rooms, collision is
negligible.

### 6.3 Identity & reconnect

First time a browser hits the app, the server issues a `playerId` (UUID)
via an `httpOnly` cookie AND writes it to `localStorage`. The cookie
survives tab close; the localStorage copy is what the socket sends in its
handshake.

Joining a room creates a `(roomCode, playerId)` seat binding. On disconnect:

- Binding is kept; `connected: false`.
- `graceTimer` armed for 60 seconds.
- If the same `playerId` reconnects to the same `roomCode` within the
  window → timer cancelled, seat reclaimed.
- Otherwise → seat's binding flips to a bot (with the configured fallback
  policy), timer cleared.

### 6.4 REST surface

```
POST /api/rooms                   → { roomCode, playerId }   create + become host
POST /api/rooms/:code/join        → { seat }                 claim an empty seat
POST /api/rooms/:code/start       → 204                      (host only) fill bots, deal
GET  /api/rooms/:code/snapshot    → RedactedGameState        hard-refresh recovery
```

Everything else is Socket.IO.

### 6.5 Socket.IO topology

One namespace: `/game`. Each `Room.code` is a Socket.IO room — broadcasts
scoped to it. Per-seat private messages (your concealed draws) go to a
per-`playerId` Socket.IO room as well.

### 6.6 Wire protocol

**Client → Server**

```
c:intent       { roomCode, intent: Intent }
c:hello        { roomCode, playerId }            // on connect; server replies with redacted snapshot
```

**Server → Client**

```
s:snapshot     { state: RedactedGameState }      // full picture after hello / start / reconnect
s:event        { event: Event, seq: number }     // every state-changing thing
s:lobby        { seats: SeatBinding[], host: PlayerId }   // pre-start membership
s:error        { code: string, message: string }
```

`seq` is monotonic per room so clients can detect dropped events; on a
gap, the client requests a fresh snapshot.

### 6.7 Per-seat redaction

`redactFor(state, seat)`:

- Other players' `Hand.concealed` → `{ count: number }`.
- `wall` → `{ remaining: number }`.
- `discards`, `exposed` melds, `flowers`, scores → public.

Applied at the exact moment of broadcast: once for snapshots, then
per-recipient for any event with private info. The most common case is
`drew`: active seat gets `{ tile }`, everyone else gets just the count
change.

### 6.8 Dispatcher loop

```ts
async function applyIntent(room, fromSeat, intent) {
  const legal = legalIntents(room.state, fromSeat);
  if (!isLegal(legal, intent)) return error('illegal');
  const [next, events] = step(room.state, intent);   // pure
  room.state = next;
  for (const ev of events) broadcastRedacted(room, ev);
  await maybeRunBotTurns(room);
}

async function maybeRunBotTurns(room) {
  while (botOwnsCurrentDecision(room)) {
    const [seat, view] = botViewFor(room);
    await jitterDelay(400, 900);
    const intent = room.policies[seat]!.decide(view);
    await applyIntent(room, seat, intent);
  }
}
```

This is the **only** code path that mutates `GameState`. Single-threaded
JS means intents are linearized in arrival order; engine purity means the
result is deterministic per state.

### 6.9 Deliberately absent

- No database, no Redis, no persistence.
- No real auth — `playerId` is an opaque token; whoever has it is "you."
  Acceptable for friends-only.
- No rate limiting beyond per-socket queueing.
- No horizontal scaling: rooms live in process memory.

## 7. Client

### 7.1 Routes

- `/` — landing: Create room or enter 4-char code + display name to join.
- `/room/:code` — game table; same component covers lobby / play / end,
  branched by `state.phase`.

### 7.2 Responsive layout

Three breakpoints:

- Phone (≤640px, portrait): opponents stacked top, river+log middle, my
  hand + actions bottom. Hand scrolls/wraps if 16 tiles overflow.
- Tablet (641–1024px): opponents on three sides of a square center, river
  + log centered.
- Desktop (≥1025px): full table layout, log as right rail.

Tailwind utility classes drive the grid. Same React components at every
size. Tiles scale via `--tile-h` CSS custom property — one value per
breakpoint, every tile dimension derives from it.

### 7.3 Components

- `<Tile tile face='up'|'down' state='idle'|'just-drawn'|'selected'|'dimmed' />`
- `<Hand tiles legalDiscards onDiscard />` — sorted, click-to-discard,
  drag-to-discard on touch. Just-drawn tile rendered slightly offset
  (standard mahjong convention).
- `<Seat seat binding count exposed flowers active winner />` — opponent
  card; face-down tile count, exposed-meld row, flower tray, active ring.
- `<Discards highlightLast />` — 6-wide rows, oldest top-left; last tile
  faintly pulsed.
- `<ActionBar legalIntents onIntent />` — context-aware. Shows only legal
  options. Pong/Chow/Kong with multiple completions opens a small popover
  to pick which. **Pass button is prominent during claim windows** since
  there are no timers.
- `<ActionLog entries />` — side panel on desktop/tablet, bottom-sheet on
  phone. Entries like `▣ Vincent discarded 5萬`. Hover an entry → highlight
  the corresponding river tile.
- `<EndOfHandModal winner hands breakdown />` — full reveal, winner's tai
  breakdown, "Leave room" button.

### 7.4 State management

Zustand store mirrors the redacted `GameState`:

```ts
const useGame = create<GameStore>((set, get) => ({
  state: null as RedactedGameState | null,
  mySeat: null as Seat | null,
  legalIntents: [] as Intent[],
  log: [] as ActionLogEntry[],
  pendingAnim: null as AnimCue | null,
  applyEvent(ev: Event) { … },
  setSnapshot(snap) { … },
}));
```

The socket layer is the **only** thing that calls `applyEvent` /
`setSnapshot`. Components subscribe via selectors and re-render minimally.

### 7.5 Animations

Framer Motion variants driven by engine events:

| Event | Visual |
|-------|--------|
| `drew` (you) | Tile slides from wall into hand's right edge, offset |
| `drew` (other) | Their count pulses +1; face-down tile flies from wall to their seat |
| `discarded` | Tile lifts, glides to next river slot, settles softly |
| `melded` | Discarded tile leaps back to claimer's exposed area, joined by 2/3 from concealed |
| `flowerReplaced` | Flower flips out to tray with sparkle; replacement slides in |
| `won` | Winning hand fans face-up at center with 0.3s stagger + subtle glow |
| `drawWall` | River fades, "Draw" banner, scores |

Uses Framer's `layout` prop so React reconciliation handles position
changes — we move the tile in the DOM, Framer interpolates. When the
browser reports `prefers-reduced-motion: reduce`, animations fall back
to instant cuts (no interpolation, no glow, no stagger); sounds still
play unless the user also mutes.

### 7.6 Sound

Howler.js, one sprite sheet, six cues:

- `click` (tile tap), `discard` (river clack), `claim` (pong/chow/kong
  rising tone), `draw` (faint swish), `flower` (chime), `win` (chord, 0.8s).

Fires from the same event handler as animations. Global mute toggle in
header; default-on on desktop, default-off on mobile (browsers block
autoplay anyway).

### 7.7 Information hiding

The client never receives other players' concealed tiles. React DevTools
can't reveal them — they're not in the store. End-of-hand reveal is a
separate `s:event` once the game is `Ended`.

### 7.8 Assets

- Tiles: Wikimedia mahjong SVG set (CC-BY-SA), 144 sprites, ~150KB total
  bundled as one sprite sheet.
- Sounds: freesound.org (CC0 / CC-BY) bundled in `public/sounds/`.

### 7.9 Accessibility

- Every tile has `aria-label` (e.g. `"5 of bamboo"`).
- Active-player ring announced via `aria-live="polite"`.
- Keyboard navigation: arrows traverse hand, Enter selects, Space
  discards, Esc cancels claim popover.

## 8. Testing

### 8.1 Engine

- **Basics:** deck has 144 tiles, `sortHand` total-ordered, `tileId`
  round-trips.
- **Win-detection fixtures:** `tests/win_fixtures.json` with hundreds of
  `{ tiles, expectedDecompositions }` cases including edge cases (kong-
  included hands, all-sequential single suit, etc.).
- **Legal-move generator:** per phase, synthesized state → expected
  `Intent[]`.
- **Reducer round-trip:** `step(state, intent)` produces expected next
  state and events. Snapshot tests over short scripted hands.
- **Property tests (fast-check):** seed RNG, play 1000 random-vs-random
  hands. Invariants per step: tile count is conserved (144 across hands +
  wall + dead wall + discards + flowers), no undefined phase, score
  deltas sum to zero, no game exceeds 200 turns without ending.
- **Bot policy:** `decide(view)` always in `view.legalIntents`. Heuristic-
  specific fixtures where one discard is strictly better.

### 8.2 Server

- Real Fastify + Socket.IO on ephemeral port; `socket.io-client` drives.
- **Happy path:** create → 3 humans join → host starts → bot fills seat
  4 → scripted intents → end-of-hand snapshot matches engine prediction.
- **Reconnect:** disconnect at t, fake-clock-advance to t+30s → reclaim;
  same scenario to t+90s → seat is now bot.
- **Illegal intents:** out-of-turn discards, wrong tiles, etc. → `s:error`,
  no state change.

Time virtualized with `vi.useFakeTimers()`.

### 8.3 Client

- **Component tests (vitest + RTL):** `applyEvent` over fixture event
  stream; `<ActionBar>` button visibility matches `legalIntents`;
  `<Hand>` keyboard navigation.
- **E2E (Playwright):** one canonical scenario — 4 tabs against real local
  server, scripted via a tiny "test pilot" layer that submits intents
  through UI clicks. One full hand → end-of-hand modal assertion. Runs in
  CI per push.
- **Mobile E2E:** same scenario in 375×812 with touch emulation; asserts
  no overflow and hand reachability.

### 8.4 Not tested

- Pixel-exact animation frames (brittle).
- Sound playback in jsdom (Howler integration painful; cues are wired to
  tested events, so integration is exercised by construction).
- Network jitter / dropped packets (Socket.IO upstream-tested).
- Concurrent chat-input races — no chat in v1.

### 8.5 CI

GitHub Actions: one job `pnpm -r test`, one job Playwright headless.
Both must pass to merge. Target wall-clock: <4 min.

## 9. Local dev workflow

Assumes a Unix-like shell (macOS or Linux; Windows via WSL).

- One-time on macOS: `brew install node pnpm`.
- `pnpm install` from the repo root.
- `pnpm dev` — `tsc -w` for engine, `nodemon` for server, `vite` for
  client, all in parallel via `concurrently`. Client proxies `/socket.io`
  to server.
- `pnpm test --watch` — engine test loop while writing rules.
- `pnpm exec playwright test --ui` — interactive E2E.

## 9.1 Deployment (Fly.io free tier)

The server builds and deploys as a single Linux container that serves
both the built client (static files from `packages/client/dist/`) and
the WebSocket endpoint.

- `fly launch` once to create the app + initial `fly.toml`.
- `fly deploy` for each push; zero-downtime rolling deploy in ~60s.
- Free-tier allowance (3× shared-cpu-1x @ 256MB) is more than enough
  for a single-process Node + Socket.IO game server.
- A redeploy or VM reboot drops in-memory rooms — accepted because
  rooms are single-hand and friends can recreate one in seconds.
- The Fly app gets a free `<app>.fly.dev` URL; that's the URL hosts
  share with friends along with the 4-character room code.

## 10. Risks & open questions for the implementation plan

- Win detector performance on the hottest path — must be fast enough to
  run on every `claim` candidate without lag. Memoization should make this
  trivial but worth benchmarking early.
- Framer Motion `layout` with conditional rendering of tiles flying
  between containers (hand → river → exposed-meld area) — needs careful
  `layoutId` choices to avoid janky cross-fades.
- Mobile drag-to-discard ergonomics — may need a long-press alternative.
- Tile asset license check (Wikimedia CC-BY-SA requires attribution
  surface in the UI).
- Concealed-kong UX during own turn (no claim window; needs an explicit
  button before discarding).
