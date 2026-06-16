import { describe, it, expect } from 'vitest';
import { initialState, SEATS } from '../src/game.js';
import { seededRng } from '../src/rng.js';

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
