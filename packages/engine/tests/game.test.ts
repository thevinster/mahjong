import { describe, it, expect } from 'vitest';
import { initialState, SEATS, step } from '../src/game.js';
import { seededRng } from '../src/rng.js';
import { tileId } from '../src/tiles.js';

describe('initialState', () => {
  it('deals 16 tiles to each non-dealer seat (after flower replacement)', () => {
    const s = initialState(seededRng(1));
    for (const seat of SEATS) {
      const total = s.hands[seat].concealed.length + s.hands[seat].flowers.length;
      // dealer has 17 (extra draw), others have 16
      const expected = seat === 0 ? 17 : 16;
      expect(total).toBe(expected);
    }
  });

  it('no flowers remain in concealed slice', () => {
    const s = initialState(seededRng(2));
    for (const seat of SEATS) {
      expect(s.hands[seat].concealed.every((t) => t.kind !== 'flower')).toBe(true);
    }
  });

  it('starts in awaitDiscard for dealer', () => {
    const s = initialState(seededRng(3));
    expect(s.phase).toEqual({ t: 'awaitDiscard', seat: 0 });
  });

  it('conserves 144 tiles across all locations', () => {
    const s = initialState(seededRng(4));
    let total = s.wall.length + s.deadWall.length;
    for (const seat of SEATS) {
      total += s.hands[seat].concealed.length + s.hands[seat].flowers.length;
    }
    expect(total).toBe(144);
  });
});

describe('step — discard', () => {
  it('discard moves to awaitClaims with pending = other 3 seats', () => {
    const s = initialState(seededRng(11));
    const tile = s.hands[0].concealed[0]!;
    const [next, events] = step(s, { t: 'discard', seat: 0, tile });
    expect(next.phase.t).toBe('awaitClaims');
    if (next.phase.t === 'awaitClaims') {
      expect(next.phase.from).toBe(0);
      expect(new Set(next.phase.pendingFrom)).toEqual(new Set([1, 2, 3]));
      expect(tileId(next.phase.discard)).toBe(tileId(tile));
    }
    expect(events.find((e) => e.t === 'discarded')).toBeTruthy();
    // discard added to river
    expect(next.discards[next.discards.length - 1]?.seat).toBe(0);
  });

  it('discard reduces dealer concealed from 17 to 16', () => {
    const s = initialState(seededRng(12));
    expect(s.hands[0].concealed.length).toBe(17);
    const [next] = step(s, { t: 'discard', seat: 0, tile: s.hands[0].concealed[0]! });
    expect(next.hands[0].concealed.length).toBe(16);
  });
});
