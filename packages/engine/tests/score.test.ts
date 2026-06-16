import { describe, it, expect } from 'vitest';
import { scoreWin } from '../src/score.js';
import { parseTileId } from '../src/tiles.js';
import type { Tile } from '../src/tiles.js';
import type { Hand } from '../src/hand.js';

function hand(ids: string): Hand {
  return { concealed: ids.split(' ').map((id) => parseTileId(id)), exposed: [], flowers: [] };
}

describe('scoreWin', () => {
  it('base win = 1 tai', () => {
    const h = hand('m1 m1 m1 m2 m2 m2 m3 m3 m3 m4 m4 m4 m5 m5 m5 m6 m6');
    const r = scoreWin({
      hand: h, winningTile: { kind: 'suit', suit: 'm', rank: 6 }, from: 'self',
      seatWind: 'E', prevailingWind: 'E',
    });
    expect(r.tai).toBeGreaterThanOrEqual(1);
    expect(r.breakdown.some((b) => b.name === 'base')).toBe(true);
  });

  it('seat wind pong adds 1 tai (East pongs E)', () => {
    const h = hand('E E E S S S W W W N N N R R R G G');
    const r = scoreWin({
      hand: h, winningTile: { kind: 'honor', honor: 'G' }, from: 0,
      seatWind: 'E', prevailingWind: 'E',
    });
    // base + seat wind + prevailing wind + dragons (R, G) = at least 4
    expect(r.tai).toBeGreaterThanOrEqual(4);
    expect(r.breakdown.some((b) => b.name === 'seat-wind')).toBe(true);
    expect(r.breakdown.some((b) => b.name === 'prevailing-wind')).toBe(true);
  });

  it('self-draw adds 1 tai', () => {
    const h = hand('m1 m2 m3 p1 p2 p3 s1 s2 s3 m5 m5 m5 p7 p8 p9 R R');
    const r = scoreWin({
      hand: h, winningTile: { kind: 'suit', suit: 'p', rank: 9 }, from: 'self',
      seatWind: 'S', prevailingWind: 'E',
    });
    expect(r.breakdown.some((b) => b.name === 'self-draw')).toBe(true);
  });

  it('flowers count one tai each', () => {
    const h: Hand = {
      ...hand('m1 m1 m1 m2 m2 m2 m3 m3 m3 m4 m4 m4 m5 m5 m5 m6 m6'),
      flowers: [{ kind: 'flower', flower: 'F1' }, { kind: 'flower', flower: 'S2' }],
    };
    const r = scoreWin({
      hand: h, winningTile: { kind: 'suit', suit: 'm', rank: 6 }, from: 'self',
      seatWind: 'E', prevailingWind: 'E',
    });
    const flowerCount = r.breakdown.filter((b) => b.name === 'flower').length;
    expect(flowerCount).toBe(2);
  });
});
