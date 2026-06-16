import { describe, it, expect } from 'vitest';
import { shanten } from '../../src/bot/shanten.js';
import { parseTileId } from '../../src/tiles.js';

function tiles(ids: string) { return ids.split(' ').map(parseTileId); }

describe('shanten (orphan count)', () => {
  it('returns -1 for a winning hand (17 tiles forming 5 melds + pair)', () => {
    expect(shanten(tiles('m1 m1 m1 m2 m2 m2 m3 m3 m3 m4 m4 m4 m5 m5 m5 m6 m6'))).toBe(-1);
  });

  it('returns 0 when every tile participates in a pair/pong or has a near neighbor', () => {
    // m1×3 m2×3 m3×3 m4×3 m5×3 m6×1 — m6 is single but m5 is adjacent
    expect(shanten(tiles('m1 m1 m1 m2 m2 m2 m3 m3 m3 m4 m4 m4 m5 m5 m5 m6'))).toBe(0);
  });

  it('returns a large number for a hand of fully isolated tiles', () => {
    // every tile is gap-3 apart in its suit and there's no pair
    expect(shanten(tiles('m1 m4 m7 p1 p4 p7 s1 s4 s7 E S W N R G Wh m1')))
      .toBeGreaterThan(8);
  });

  it('is monotonic: removing a paired tile increases (or holds) the count', () => {
    const before = shanten(tiles('m5 m5 m5 m6 m6 p1 p2 p3 s7 s8 s9 E E E R R'));
    const after  = shanten(tiles('m5 m5 m6 m6 p1 p2 p3 s7 s8 s9 E E E R R')); // dropped one m5
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
