import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { initialState, step, SEATS, type GameState, type Seat } from '../src/game.js';
import { legalIntents } from '../src/rules.js';
import { randomPolicy } from '../src/bot/random.js';
import { buildBotView } from '../src/bot/view.js';
import { seededRng } from '../src/rng.js';

function totalTileCount(s: GameState): number {
  let n = s.wall.length + s.deadWall.length + s.discards.length;
  for (const seat of SEATS) {
    n += s.hands[seat].concealed.length + s.hands[seat].flowers.length;
    for (const m of s.hands[seat].exposed) {
      n += m.kind === 'kong' ? 4 : 3;
    }
  }
  return n;
}

function playOneGame(seed: number): { ended: boolean; turns: number; finalSum: number; tileCountStart: number; tileCountEnd: number } {
  let state = initialState(seededRng(seed));
  const startCount = totalTileCount(state);
  let turns = 0;
  while (state.phase.t !== 'ended' && turns < 400) {
    const seat = currentActor(state);
    const view = buildBotView(state, seat, seededRng(seed * 1000 + turns));
    const intent = randomPolicy.decide(view);
    const legal = legalIntents(state, seat);
    const ok = legal.some((i) =>
      i.t === intent.t && (i as { seat?: number }).seat === (intent as { seat?: number }).seat);
    if (!ok) throw new Error(`random policy emitted illegal intent at turn ${turns}`);
    [state] = step(state, intent);
    turns++;
  }
  const finalSum = state.phase.t === 'ended'
    ? Object.values(state.phase.score).reduce((a, b) => a + b, 0)
    : 0;
  return { ended: state.phase.t === 'ended', turns, finalSum, tileCountStart: startCount, tileCountEnd: totalTileCount(state) };
}

function currentActor(state: GameState): Seat {
  if (state.phase.t === 'awaitDiscard') return state.phase.seat;
  if (state.phase.t === 'awaitClaims') return state.phase.pendingFrom[0]!;
  return 0;
}

describe('property: random-vs-random invariants over many games', () => {
  it('every game ends within 400 turns', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (seed) => {
        const r = playOneGame(seed);
        expect(r.ended).toBe(true);
        expect(r.turns).toBeLessThanOrEqual(400);
      }),
      { numRuns: 100 },
    );
  });

  it('tile count is conserved (always 144)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (seed) => {
        const r = playOneGame(seed);
        expect(r.tileCountStart).toBe(144);
        expect(r.tileCountEnd).toBe(144);
      }),
      { numRuns: 100 },
    );
  });

  it('final score deltas sum to zero', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (seed) => {
        const r = playOneGame(seed);
        expect(r.finalSum).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});
