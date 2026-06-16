import type { Tile, FlowerTile } from './tiles.js';
import { buildDeck } from './tiles.js';
import { type Rng, shuffle } from './rng.js';
import type { Hand } from './hand.js';
import { emptyHand, addTile, removeTile } from './hand.js';
import type { Event, TaiItem } from './events.js';
import { makePong, makeChow, makeKong, meldTiles, type Meld } from './meld.js';
import { scoreWin } from './score.js';

export type Seat = 0 | 1 | 2 | 3;
export const SEATS: readonly Seat[] = [0, 1, 2, 3];

export type Phase =
  | { t: 'awaitDiscard'; seat: Seat }
  | { t: 'awaitClaims';  discard: Tile; from: Seat; pendingFrom: readonly Seat[] }
  | { t: 'ended';        winner: Seat | null; score: Readonly<Record<Seat, number>> };

export type GameState = {
  readonly hands: Readonly<Record<Seat, Hand>>;
  readonly wall: readonly Tile[];
  readonly deadWall: readonly Tile[];
  readonly discards: readonly { seat: Seat; tile: Tile }[];
  readonly phase: Phase;
  readonly dealer: Seat;
  readonly seatWind: Readonly<Record<Seat, 'E'|'S'|'W'|'N'>>;
  readonly prevailingWind: 'E';
  readonly handNumber: 1;
};

export type Intent =
  | { t: 'discard';              seat: Seat; tile: Tile }
  | { t: 'claim';                seat: Seat; kind: 'pong'|'chow'|'kong'|'win'; tiles: readonly Tile[] }
  | { t: 'pass';                 seat: Seat }
  | { t: 'declareSelfWin';       seat: Seat }
  | { t: 'declareConcealedKong'; seat: Seat; tile: Tile };

/**
 * Build initial state: shuffle deck, deal 16 tiles per seat, replace flowers
 * from dead wall, dealer (seat 0) gets the first draw to start with 17.
 * Returns state where dealer is in awaitDiscard.
 */
export function initialState(rng: Rng): GameState {
  let deck = shuffle(buildDeck(), rng);
  const deadWall = deck.slice(deck.length - 14);
  let wall: Tile[] = deck.slice(0, deck.length - 14);

  const hands: Record<Seat, Hand> = { 0: emptyHand(), 1: emptyHand(), 2: emptyHand(), 3: emptyHand() };

  // Deal 16 tiles to each seat (sequential block per seat — statistically
  // equivalent to round-robin given the deck is already shuffled).
  for (const seat of SEATS) {
    for (let i = 0; i < 16; i++) {
      const t = wall.shift()!;
      hands[seat] = addTile(hands[seat], t);
    }
  }
  // Dealer draws extra to reach 17 (will discard first)
  const firstDraw = wall.shift()!;
  hands[0] = addTile(hands[0], firstDraw);

  // Replace all flowers from dead wall tail
  const dwIter = [...deadWall];
  for (const seat of SEATS) {
    while (hands[seat].concealed.some((t) => t.kind === 'flower')) {
      const flowerIdx = hands[seat].concealed.findIndex((t) => t.kind === 'flower');
      const flower = hands[seat].concealed[flowerIdx]! as FlowerTile;
      hands[seat] = {
        ...hands[seat],
        concealed: [
          ...hands[seat].concealed.slice(0, flowerIdx),
          ...hands[seat].concealed.slice(flowerIdx + 1),
        ],
        flowers: [...hands[seat].flowers, flower],
      };
      const repl = dwIter.pop();
      if (!repl) throw new Error('dead wall exhausted during initial flower replacement');
      hands[seat] = addTile(hands[seat], repl);
    }
  }

  return {
    hands: { 0: hands[0], 1: hands[1], 2: hands[2], 3: hands[3] },
    wall,
    deadWall: dwIter,
    discards: [],
    phase: { t: 'awaitDiscard', seat: 0 },
    dealer: 0,
    seatWind: { 0: 'E', 1: 'S', 2: 'W', 3: 'N' },
    prevailingWind: 'E',
    handNumber: 1,
  };
}

/**
 * Pure reducer. Returns next state + emitted events.
 * Caller is responsible for ensuring the intent is legal (use rules.legalIntents).
 */
export function step(state: GameState, intent: Intent): [GameState, Event[]] {
  switch (intent.t) {
    case 'discard':              return applyDiscard(state, intent);
    case 'pass':                 return applyPass(state, intent);
    case 'claim':                return applyClaim(state, intent);
    case 'declareSelfWin':       return applySelfWin(state, intent);
    case 'declareConcealedKong': return applyConcealedKong(state, intent);
  }
}

function applyDiscard(
  state: GameState,
  intent: Extract<Intent, { t: 'discard' }>,
): [GameState, Event[]] {
  const hand = state.hands[intent.seat];
  const newHand = removeTile(hand, intent.tile);
  const newHands = { ...state.hands, [intent.seat]: newHand };
  const others = ([0, 1, 2, 3] as Seat[]).filter((s) => s !== intent.seat);
  const next: GameState = {
    ...state,
    hands: newHands,
    discards: [...state.discards, { seat: intent.seat, tile: intent.tile }],
    phase: { t: 'awaitClaims', discard: intent.tile, from: intent.seat, pendingFrom: others },
  };
  const ev: Event[] = [{ t: 'discarded', seat: intent.seat, tile: intent.tile }];
  return [next, ev];
}

function applyPass(
  state: GameState,
  intent: Extract<Intent, { t: 'pass' }>,
): [GameState, Event[]] {
  if (state.phase.t !== 'awaitClaims') throw new Error('pass outside awaitClaims');
  const remaining = state.phase.pendingFrom.filter((s) => s !== intent.seat);
  if (remaining.length > 0) {
    return [{ ...state, phase: { ...state.phase, pendingFrom: remaining } }, []];
  }
  // Everyone passed — discard sits in river, next player draws.
  return drawAndAdvance(state, ((state.phase.from + 1) & 3) as Seat);
}

function applyClaim(
  state: GameState,
  intent: Extract<Intent, { t: 'claim' }>,
): [GameState, Event[]] {
  if (state.phase.t !== 'awaitClaims') throw new Error('claim outside awaitClaims');
  if (intent.kind === 'win') {
    return resolveWinClaim(state, intent.seat, state.phase.discard, state.phase.from);
  }
  // Build meld and update hand
  const seat = intent.seat;
  const hand = state.hands[seat];
  const fromSeat = state.phase.from;
  let meld: Meld;
  let concealedAfter = [...hand.concealed];
  if (intent.kind === 'pong') {
    const pongMeld = makePong(intent.tiles as [import('./tiles.js').Tile, import('./tiles.js').Tile, import('./tiles.js').Tile], fromSeat);
    // remove 2 matching tiles (one came from discard)
    for (let i = 0; i < 2; i++) {
      const idx = concealedAfter.findIndex((c) => tilesEqualLocal(c, pongMeld.tile));
      concealedAfter.splice(idx, 1);
    }
    meld = pongMeld;
  } else if (intent.kind === 'kong') {
    const kongMeld = makeKong(intent.tiles as [import('./tiles.js').Tile, import('./tiles.js').Tile, import('./tiles.js').Tile, import('./tiles.js').Tile], false, fromSeat);
    for (let i = 0; i < 3; i++) {
      const idx = concealedAfter.findIndex((c) => tilesEqualLocal(c, kongMeld.tile));
      concealedAfter.splice(idx, 1);
    }
    meld = kongMeld;
  } else {
    // chow
    const chowMeld = makeChow(intent.tiles as [import('./tiles.js').SuitTile, import('./tiles.js').SuitTile, import('./tiles.js').SuitTile], fromSeat);
    // remove the two non-discard tiles
    for (const t of chowMeld.tiles) {
      if (tilesEqualLocal(t, state.phase.discard)) continue;
      const idx = concealedAfter.findIndex((c) => tilesEqualLocal(c, t));
      concealedAfter.splice(idx, 1);
    }
    meld = chowMeld;
  }
  const newHand = {
    ...hand,
    concealed: concealedAfter,
    exposed: [...hand.exposed, meld],
  };
  // The claimed tile leaves the river — it's now part of the meld.
  // Remove the last entry from discards (which is always the tile being claimed,
  // since claims only happen during awaitClaims for the most recent discard).
  const newDiscards = state.discards.slice(0, -1);
  const newState: GameState = {
    ...state,
    hands: { ...state.hands, [seat]: newHand },
    discards: newDiscards,
    phase: { t: 'awaitDiscard', seat },
  };
  const events: Event[] = [{ t: 'melded', seat, meld }];

  // For kong: draw replacement immediately
  if (intent.kind === 'kong') {
    return drawReplacementAfterKong(newState, seat, events);
  }
  return [newState, events];
}

function tilesEqualLocal(a: import('./tiles.js').Tile, b: import('./tiles.js').Tile): boolean {
  // small local re-implementation to avoid importing inside function
  if (a.kind !== b.kind) return false;
  if (a.kind === 'suit'   && b.kind === 'suit')   return a.suit === b.suit && a.rank === b.rank;
  if (a.kind === 'honor'  && b.kind === 'honor')  return a.honor === b.honor;
  if (a.kind === 'flower' && b.kind === 'flower') return a.flower === b.flower;
  return false;
}

function drawAndAdvance(state: GameState, nextSeat: Seat): [GameState, Event[]] {
  const events: Event[] = [];
  let wall = [...state.wall];
  if (wall.length === 0) {
    return [
      { ...state, phase: { t: 'ended', winner: null, score: { 0: 0, 1: 0, 2: 0, 3: 0 } } },
      [{ t: 'drawWall' }],
    ];
  }
  let hand = state.hands[nextSeat];
  let deadWall = [...state.deadWall];
  let drawn = wall.shift()!;
  // flower replacement loop
  while (drawn.kind === 'flower') {
    hand = { ...hand, flowers: [...hand.flowers, drawn] };
    if (deadWall.length === 0) {
      return [
        { ...state, hands: { ...state.hands, [nextSeat]: hand },
          phase: { t: 'ended', winner: null, score: { 0: 0, 1: 0, 2: 0, 3: 0 } } },
        [...events, { t: 'flowerReplaced', seat: nextSeat, flower: drawn }, { t: 'drawWall' }],
      ];
    }
    const repl = deadWall.pop()!;
    events.push({ t: 'flowerReplaced', seat: nextSeat, flower: drawn, replacement: repl });
    drawn = repl;
  }
  hand = { ...hand, concealed: [...hand.concealed, drawn] };
  events.push({ t: 'drew', seat: nextSeat, tileForSeat: drawn });
  const next: GameState = {
    ...state,
    hands: { ...state.hands, [nextSeat]: hand },
    wall,
    deadWall,
    phase: { t: 'awaitDiscard', seat: nextSeat },
  };
  return [next, events];
}

function drawReplacementAfterKong(state: GameState, seat: Seat, prevEvents: Event[]): [GameState, Event[]] {
  // Replacement tile comes from dead wall tail (same as flower replacement)
  let deadWall = [...state.deadWall];
  const events = [...prevEvents];
  if (deadWall.length === 0) {
    return [
      { ...state, phase: { t: 'ended', winner: null, score: { 0: 0, 1: 0, 2: 0, 3: 0 } } },
      [...events, { t: 'drawWall' }],
    ];
  }
  let drawn = deadWall.pop()!;
  let hand = state.hands[seat];
  while (drawn.kind === 'flower') {
    hand = { ...hand, flowers: [...hand.flowers, drawn] };
    if (deadWall.length === 0) {
      return [
        { ...state, hands: { ...state.hands, [seat]: hand },
          phase: { t: 'ended', winner: null, score: { 0: 0, 1: 0, 2: 0, 3: 0 } } },
        [...events, { t: 'flowerReplaced', seat, flower: drawn }, { t: 'drawWall' }],
      ];
    }
    const repl = deadWall.pop()!;
    events.push({ t: 'flowerReplaced', seat, flower: drawn, replacement: repl });
    drawn = repl;
  }
  hand = { ...hand, concealed: [...hand.concealed, drawn] };
  events.push({ t: 'drew', seat, tileForSeat: drawn });
  return [{ ...state, hands: { ...state.hands, [seat]: hand }, deadWall }, events];
}

function resolveWinClaim(
  state: GameState,
  winner: Seat,
  winningTile: import('./tiles.js').Tile,
  from: Seat,
): [GameState, Event[]] {
  const handAfter = {
    ...state.hands[winner],
    concealed: [...state.hands[winner].concealed, winningTile],
  };
  const result = scoreWin({
    hand: handAfter, winningTile, from,
    seatWind: state.seatWind[winner], prevailingWind: state.prevailingWind,
  });
  const score: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  score[winner] = result.tai;
  score[from] = -result.tai;
  // The winning tile leaves the river — it's now in the winner's hand.
  return [
    {
      ...state,
      hands: { ...state.hands, [winner]: handAfter },
      discards: state.discards.slice(0, -1),
      phase: { t: 'ended', winner, score },
    },
    [{ t: 'won', seat: winner, from, score: result.tai, breakdown: result.breakdown }],
  ];
}

/**
 * Given a set of pending claim intents (one per pending seat), pick the one
 * that wins by Taiwanese priority: win > kong > pong > chow.
 * Caller passes either (a) a claim intent or (b) a pass intent per seat.
 * Returns the chosen claim intent or null (everyone passed).
 * Multiple wins → head bump in turn order from the discarder.
 */
export function resolveClaimPriority(
  pending: readonly Intent[],
  discarder: Seat,
): Intent | null {
  const claims = pending.filter((i) => i.t === 'claim') as Array<Extract<Intent, { t: 'claim' }>>;
  if (claims.length === 0) return null;
  const wins = claims.filter((c) => c.kind === 'win');
  if (wins.length > 0) {
    return wins.sort((a, b) =>
      seatDistance(discarder, a.seat) - seatDistance(discarder, b.seat))[0]!;
  }
  const kong = claims.find((c) => c.kind === 'kong');
  if (kong) return kong;
  const pong = claims.find((c) => c.kind === 'pong');
  if (pong) return pong;
  return claims.find((c) => c.kind === 'chow') ?? null;
}

function seatDistance(from: Seat, to: Seat): number {
  return ((to - from + 4) & 3);
}

export type RedactedHand =
  | { own: true;  concealed: readonly Tile[]; exposed: readonly Meld[]; flowers: readonly FlowerTile[] }
  | { own: false; concealedCount: number;     exposed: readonly Meld[]; flowers: readonly FlowerTile[] };

export type RedactedGameState = {
  readonly hands: Readonly<Record<Seat, RedactedHand>>;
  readonly wallRemaining: number;
  readonly deadWallRemaining: number;
  readonly discards: readonly { seat: Seat; tile: Tile }[];
  readonly phase: Phase;
  readonly dealer: Seat;
  readonly seatWind: Readonly<Record<Seat, 'E'|'S'|'W'|'N'>>;
  readonly prevailingWind: 'E';
  readonly handNumber: 1;
  readonly viewer: Seat;
};

export function redactFor(state: GameState, viewer: Seat): RedactedGameState {
  const hands: Record<Seat, RedactedHand> = {
    0: redactHand(state, 0, viewer),
    1: redactHand(state, 1, viewer),
    2: redactHand(state, 2, viewer),
    3: redactHand(state, 3, viewer),
  };
  return {
    hands,
    wallRemaining:     state.wall.length,
    deadWallRemaining: state.deadWall.length,
    discards:          state.discards,
    phase:             state.phase,
    dealer:            state.dealer,
    seatWind:          state.seatWind,
    prevailingWind:    state.prevailingWind,
    handNumber:        state.handNumber,
    viewer,
  };
}

function redactHand(state: GameState, seat: Seat, viewer: Seat): RedactedHand {
  const h = state.hands[seat];
  if (seat === viewer) {
    return { own: true, concealed: h.concealed, exposed: h.exposed, flowers: h.flowers };
  }
  return { own: false, concealedCount: h.concealed.length, exposed: h.exposed, flowers: h.flowers };
}

// Stubs — implemented in later tasks
function applySelfWin(
  state: GameState,
  intent: Extract<Intent, { t: 'declareSelfWin' }>,
): [GameState, Event[]] {
  if (state.phase.t !== 'awaitDiscard' || state.phase.seat !== intent.seat) {
    throw new Error('declareSelfWin out of turn');
  }
  const winningTile = state.hands[intent.seat].concealed[state.hands[intent.seat].concealed.length - 1]!;
  const result = scoreWin({
    hand: state.hands[intent.seat], winningTile, from: 'self',
    seatWind: state.seatWind[intent.seat], prevailingWind: state.prevailingWind,
  });
  const score: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  score[intent.seat] = result.tai * 3;
  for (const s of [0, 1, 2, 3] as Seat[]) if (s !== intent.seat) score[s] = -result.tai;
  return [
    { ...state, phase: { t: 'ended', winner: intent.seat, score } },
    [{ t: 'won', seat: intent.seat, from: 'self', score: result.tai, breakdown: result.breakdown }],
  ];
}

function applyConcealedKong(
  state: GameState,
  intent: Extract<Intent, { t: 'declareConcealedKong' }>,
): [GameState, Event[]] {
  if (state.phase.t !== 'awaitDiscard' || state.phase.seat !== intent.seat) {
    throw new Error('declareConcealedKong out of turn');
  }
  const hand = state.hands[intent.seat];
  let concealedAfter = [...hand.concealed];
  for (let i = 0; i < 4; i++) {
    const idx = concealedAfter.findIndex((c) => tilesEqualLocal(c, intent.tile));
    if (idx === -1) throw new Error('not enough of tile to concealed-kong');
    concealedAfter.splice(idx, 1);
  }
  const meld: Meld = { kind: 'kong', tile: intent.tile, concealed: true };
  const newHand = { ...hand, concealed: concealedAfter, exposed: [...hand.exposed, meld] };
  const newState: GameState = { ...state, hands: { ...state.hands, [intent.seat]: newHand } };
  return drawReplacementAfterKong(newState, intent.seat, [{ t: 'melded', seat: intent.seat, meld }]);
}
