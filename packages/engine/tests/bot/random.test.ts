import { describe, it, expect } from 'vitest';
import { randomPolicy } from '../../src/bot/random.js';
import { buildBotView } from '../../src/bot/view.js';
import { initialState } from '../../src/game.js';
import { seededRng } from '../../src/rng.js';

describe('randomPolicy', () => {
  it('always returns an intent that is a member of legalIntents (or pass if empty)', () => {
    const rng = seededRng(90);
    const s = initialState(rng);
    const view = buildBotView(s, 0, seededRng(91));
    const intent = randomPolicy.decide(view);
    expect(view.legalIntents.some((i) =>
      i.t === intent.t && (i as { seat?: number }).seat === (intent as { seat?: number }).seat,
    )).toBe(true);
  });
});
