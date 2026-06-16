import { describe, it, expect } from 'vitest';
import { redactFor, initialState } from '../src/game.js';
import { seededRng } from '../src/rng.js';

describe('redactFor', () => {
  it('shows own hand fully, others only as counts', () => {
    const s = initialState(seededRng(70));
    const view = redactFor(s, 0);
    expect(view.hands[0].own).toBe(true);
    if (view.hands[0].own) {
      expect(view.hands[0].concealed).toEqual(s.hands[0].concealed);
    }
    for (const seat of [1, 2, 3] as const) {
      expect(view.hands[seat].own).toBe(false);
      if (!view.hands[seat].own) {
        expect(view.hands[seat].concealedCount).toBeGreaterThan(0);
        expect(typeof view.hands[seat].concealedCount).toBe('number');
      }
    }
  });

  it('hides wall and deadWall; replaces with counts', () => {
    const s = initialState(seededRng(71));
    const view = redactFor(s, 0);
    expect((view as { wall?: unknown }).wall).toBeUndefined();
    expect((view as { deadWall?: unknown }).deadWall).toBeUndefined();
    expect(view.wallRemaining).toBe(s.wall.length);
    expect(view.deadWallRemaining).toBe(s.deadWall.length);
  });

  it('exposed melds, flowers, discards remain visible', () => {
    const s = initialState(seededRng(72));
    const view = redactFor(s, 0);
    for (const seat of [0, 1, 2, 3] as const) {
      expect(view.hands[seat].exposed).toEqual(s.hands[seat].exposed);
      expect(view.hands[seat].flowers).toEqual(s.hands[seat].flowers);
    }
    expect(view.discards).toEqual(s.discards);
  });
});
