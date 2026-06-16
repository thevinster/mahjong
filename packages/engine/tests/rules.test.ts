import { describe, it, expect } from 'vitest';
import { legalIntents } from '../src/rules.js';
import { initialState, type Intent } from '../src/game.js';
import { seededRng } from '../src/rng.js';

describe('legalIntents — awaitDiscard', () => {
  it('dealer can discard any of their distinct concealed tiles', () => {
    const s = initialState(seededRng(1));
    const intents = legalIntents(s, 0);
    // every distinct concealed tile becomes a discard option
    const discardCount = intents.filter((i) => i.t === 'discard').length;
    // Count distinct tiles in dealer's hand
    const distinctCount = new Set(
      s.hands[0].concealed.map((t) => {
        if (t.kind === 'suit') return `${t.suit}${t.rank}`;
        if (t.kind === 'honor') return t.honor;
        return t.flower;
      })
    ).size;
    expect(discardCount).toBe(distinctCount);
    // non-dealers have no legal intents in awaitDiscard
    expect(legalIntents(s, 1)).toEqual([]);
  });
});

describe('legalIntents — awaitClaims', () => {
  it('returns pass as legal for each pending seat', () => {
    const s = initialState(seededRng(1));
    const t = s.hands[0].concealed[0]!;
    const claimState = {
      ...s,
      phase: { t: 'awaitClaims' as const, discard: t, from: 0 as const, pendingFrom: [1, 2, 3] as const },
    };
    for (const seat of [1, 2, 3] as const) {
      const intents = legalIntents(claimState, seat);
      expect(intents.some((i: Intent) => i.t === 'pass' && i.seat === seat)).toBe(true);
    }
  });
});
