import { describe, it, expect } from 'vitest';
import { findWinPartitions, isWinningHand } from '../src/win.js';
import { parseTileId } from '../src/tiles.js';
import type { Tile } from '../src/tiles.js';

function tiles(ids: string): Tile[] {
  return ids.split(' ').map(parseTileId);
}

describe('isWinningHand', () => {
  it('accepts 5 pongs + a pair (17 tiles)', () => {
    // m1 m1 m1, m2 m2 m2, m3 m3 m3, m4 m4 m4, m5 m5 m5, m6 m6
    const h = tiles('m1 m1 m1 m2 m2 m2 m3 m3 m3 m4 m4 m4 m5 m5 m5 m6 m6');
    expect(isWinningHand(h)).toBe(true);
  });

  it('accepts 5 chows + pair', () => {
    // 5 chows in m: 123, 234, 345, 456, 567, plus pair 8
    const h = tiles('m1 m2 m3 m2 m3 m4 m3 m4 m5 m4 m5 m6 m5 m6 m7 m8 m8');
    expect(isWinningHand(h)).toBe(true);
  });

  it('accepts honors-only pongs + pair', () => {
    const h = tiles('E E E S S S W W W N N N R R R G G');
    expect(isWinningHand(h)).toBe(true);
  });

  it('rejects 16 tiles (no pair)', () => {
    const h = tiles('m1 m1 m1 m2 m2 m2 m3 m3 m3 m4 m4 m4 m5 m5 m5 m6');
    expect(isWinningHand(h)).toBe(false);
  });

  it('rejects a hand that cannot partition into 5 melds + pair', () => {
    const h = tiles('m1 m2 m4 m5 m7 m8 p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7');
    expect(isWinningHand(h)).toBe(false);
  });
});

describe('findWinPartitions', () => {
  it('returns at least one partition for a valid hand', () => {
    const h = tiles('m1 m1 m1 m2 m2 m2 m3 m3 m3 m4 m4 m4 m5 m5 m5 m6 m6');
    const parts = findWinPartitions(h);
    expect(parts.length).toBeGreaterThan(0);
    const p = parts[0]!;
    expect(p.melds).toHaveLength(5);
    expect(p.pair.length).toBe(2);
  });

  it('returns multiple partitions when both pong and chow decompositions exist', () => {
    // m1 m1 m1 m1 m2 m3 ... a kong-or-chow ambiguous setup
    // For simplicity, set up where m1 m2 m3 / m1 m2 m3 vs (m1 m1) (m2 m2) (m3 m3) won't both fit 5+pair shape; skip this case.
    // Use a known-multi case: m1 m2 m3 m1 m2 m3 m1 m2 m3 / 6 honors as 2 pongs / pair
    const h = tiles('m1 m2 m3 m1 m2 m3 m1 m2 m3 E E E S S S R R');
    const parts = findWinPartitions(h);
    // exactly two decompositions: three chows or three pongs from the m1..m3 block
    expect(parts.length).toBe(2);
  });
});

import fixtures from './win.fixtures.json' assert { type: 'json' };

describe('win.fixtures.json', () => {
  for (const fx of fixtures as Array<{ name: string; tiles: string; wins: boolean; minPartitions: number }>) {
    it(fx.name, () => {
      const h = fx.tiles.split(' ').map(parseTileId);
      expect(isWinningHand(h)).toBe(fx.wins);
      expect(findWinPartitions(h).length).toBeGreaterThanOrEqual(fx.minPartitions);
    });
  }
});
