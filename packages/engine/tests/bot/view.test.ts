import { describe, it, expect } from 'vitest';
import { buildBotView } from '../../src/bot/view.js';
import { initialState } from '../../src/game.js';
import { seededRng } from '../../src/rng.js';

describe('buildBotView', () => {
  it('exposes own hand fully and opponents as counts only', () => {
    const s = initialState(seededRng(80));
    const view = buildBotView(s, 1, seededRng(81));
    expect(view.seat).toBe(1);
    expect(view.myHand.concealed.length).toBeGreaterThan(0);
    for (const seat of [0, 2, 3] as const) {
      expect(view.opponents[seat].concealedCount).toBeGreaterThan(0);
    }
    expect(view.legalIntents.length).toBeGreaterThanOrEqual(0);
  });
});
