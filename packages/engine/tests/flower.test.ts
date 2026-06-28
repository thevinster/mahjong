import { describe, it, expect } from 'vitest';
import { initialState, step, SEATS, type GameState, type Seat } from '../src/game.js';
import { seededRng } from '../src/rng.js';
import { tileId, type Tile } from '../src/tiles.js';

const F = (f: string): Tile => ({ kind: 'flower', flower: f as never });
const m = (r: number): Tile => ({ kind: 'suit', suit: 'm', rank: r as never });

/** Advance from the dealer's first discard until `nextSeat` (seat 1) draws. */
function dealerDiscardThenSeat1Draws(hacked: GameState): [GameState, ReturnType<typeof step>[1]] {
  let [s] = step(hacked, { t: 'discard', seat: 0, tile: hacked.hands[0].concealed[0]! });
  [s] = step(s, { t: 'pass', seat: 1 });
  [s] = step(s, { t: 'pass', seat: 2 });
  return step(s, { t: 'pass', seat: 3 }); // all passed → seat 1 draws
}

describe('flower replacement — during play', () => {
  it('replenishes the concealed hand when a drawn tile is a flower', () => {
    const s0 = initialState(seededRng(1));
    const before = s0.hands[1].concealed.length;
    const hacked: GameState = { ...s0, wall: [F('F1'), ...s0.wall], deadWall: [...s0.deadWall, m(1)] };

    const [s, events] = dealerDiscardThenSeat1Draws(hacked);

    expect(s.hands[1].concealed.length).toBe(before + 1); // drew → replenished
    expect(s.hands[1].concealed.some((t) => t.kind === 'flower')).toBe(false);
    expect(s.hands[1].flowers.map(tileId)).toContain('F1');
    expect(events.some((e) => e.t === 'flowerReplaced')).toBe(true);
  });

  it('keeps drawing when the replacement is itself a flower', () => {
    const s0 = initialState(seededRng(1));
    const before = s0.hands[1].concealed.length;
    // pop() takes the last element first: F2 (flower) then m1 (non-flower).
    const hacked: GameState = { ...s0, wall: [F('F1'), ...s0.wall], deadWall: [...s0.deadWall, m(1), F('F2')] };

    const [s] = dealerDiscardThenSeat1Draws(hacked);

    expect(s.hands[1].concealed.length).toBe(before + 1);
    expect(s.hands[1].concealed.some((t) => t.kind === 'flower')).toBe(false);
    expect(s.hands[1].flowers.map(tileId)).toEqual(expect.arrayContaining(['F1', 'F2']));
  });
});

describe('flower replacement — initial deal', () => {
  it('leaves every seat with a full, flower-free concealed hand across many deals', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const s = initialState(seededRng(seed));
      for (const seat of SEATS as readonly Seat[]) {
        const expected = seat === 0 ? 17 : 16;
        expect(s.hands[seat].concealed.length, `seed ${seed} seat ${seat} concealed`).toBe(expected);
        expect(
          s.hands[seat].concealed.some((t) => t.kind === 'flower'),
          `seed ${seed} seat ${seat} has flower in concealed`,
        ).toBe(false);
      }
    }
  });
});
