import { describe, it, expect } from 'vitest';
import { legalIntents } from '../src/rules.js';
import { initialState, type GameState, type Intent } from '../src/game.js';
import { seededRng } from '../src/rng.js';
import { parseTileId } from '../src/tiles.js';
import type { Meld } from '../src/meld.js';

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

describe('legalIntents — self-win with a kong', () => {
  it('offers declareSelfWin when an exposed kong + concealed 4 melds + pair complete the hand', () => {
    // Winning hand = 1 exposed kong (s1) + 4 concealed pongs (m1..m4) + pair (m5).
    // A kong is 4 tiles but only one meld, so the total tile count is 18 (17 + 1),
    // which a `% 3 === 2` guard would wrongly reject.
    const concealed = ['m1','m1','m1','m2','m2','m2','m3','m3','m3','m4','m4','m4','m5','m5']
      .map(parseTileId);
    const kong: Meld = { kind: 'kong', tile: parseTileId('s1'), concealed: false, claimedFrom: 1 };
    const s0 = initialState(seededRng(1));
    const state: GameState = {
      ...s0,
      hands: { ...s0.hands, 0: { concealed, exposed: [kong], flowers: [] } },
      phase: { t: 'awaitDiscard', seat: 0 },
    };
    const intents = legalIntents(state, 0);
    expect(intents.some((i: Intent) => i.t === 'declareSelfWin')).toBe(true);
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
