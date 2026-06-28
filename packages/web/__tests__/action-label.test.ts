import { describe, it, expect } from 'vitest';
import { claimTiles } from '../lib/action-label';
import { tileId, type Intent, type Tile } from '@mahjong/engine';

const p = (r: number): Tile => ({ kind: 'suit', suit: 'p', rank: r } as Tile);
const m = (r: number): Tile => ({ kind: 'suit', suit: 'm', rank: r } as Tile);
const E: Tile = { kind: 'honor', honor: 'E' };

describe('claimTiles — which tiles a claim button references', () => {
  it('returns the three chow tiles in order', () => {
    const chow: Intent = { t: 'claim', seat: 0, kind: 'chow', tiles: [p(3), p(4), p(5)] };
    expect(claimTiles(chow).map(tileId)).toEqual(['p3', 'p4', 'p5']);
  });

  it('returns the three pong tiles', () => {
    const pong: Intent = { t: 'claim', seat: 0, kind: 'pong', tiles: [m(5), m(5), m(5)] };
    expect(claimTiles(pong).map(tileId)).toEqual(['m5', 'm5', 'm5']);
  });

  it('returns the four tiles of a claimed kong', () => {
    const kong: Intent = { t: 'claim', seat: 0, kind: 'kong', tiles: [E, E, E, E] };
    expect(claimTiles(kong).map(tileId)).toEqual(['E', 'E', 'E', 'E']);
  });

  it('expands a concealed kong to four copies of its tile', () => {
    const ck: Intent = { t: 'declareConcealedKong', seat: 0, tile: m(2) };
    expect(claimTiles(ck).map(tileId)).toEqual(['m2', 'm2', 'm2', 'm2']);
  });

  it('returns the single winning tile for a ron win claim', () => {
    const win: Intent = { t: 'claim', seat: 0, kind: 'win', tiles: [p(7)] };
    expect(claimTiles(win).map(tileId)).toEqual(['p7']);
  });

  it('returns no tiles for a self-draw win (the whole hand wins)', () => {
    expect(claimTiles({ t: 'declareSelfWin', seat: 0 })).toEqual([]);
  });

  it('returns no tiles for pass', () => {
    expect(claimTiles({ t: 'pass', seat: 0 })).toEqual([]);
  });
});
