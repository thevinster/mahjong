import type { Tile, FlowerTile } from './tiles.js';
import { buildDeck } from './tiles.js';
import { type Rng, shuffle } from './rng.js';
import type { Hand } from './hand.js';
import { emptyHand, addTile, removeTile } from './hand.js';
import type { Event, TaiItem } from './events.js';
import { makePong, makeChow, makeKong, meldTiles, type Meld } from './meld.js';

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

// Stubs — implemented in later tasks
function applyPass(state: GameState, intent: Extract<Intent, { t: 'pass' }>): [GameState, Event[]] {
  throw new Error('not yet implemented: applyPass');
}
function applyClaim(state: GameState, intent: Extract<Intent, { t: 'claim' }>): [GameState, Event[]] {
  throw new Error('not yet implemented: applyClaim');
}
function applySelfWin(state: GameState, intent: Extract<Intent, { t: 'declareSelfWin' }>): [GameState, Event[]] {
  throw new Error('not yet implemented: applySelfWin');
}
function applyConcealedKong(state: GameState, intent: Extract<Intent, { t: 'declareConcealedKong' }>): [GameState, Event[]] {
  throw new Error('not yet implemented: applyConcealedKong');
}
