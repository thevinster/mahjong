import { describe, it, expect } from 'vitest';
import { arrangeHand } from '../lib/arrange-hand';
import { tileId, type Tile, type Rank } from '@mahjong/engine';

const m = (r: number): Tile => ({ kind: 'suit', suit: 'm', rank: r as Rank });
const p = (r: number): Tile => ({ kind: 'suit', suit: 'p', rank: r as Rank });
const ids = (a: { tile: Tile }[]) => a.map((x) => tileId(x.tile));

describe('arrangeHand', () => {
  it('auto-sorts when there is no manual order and no draw', () => {
    const out = arrangeHand([m(3), m(1), m(2)], null, null);
    expect(ids(out)).toEqual(['m1', 'm2', 'm3']);
    expect(out.every((t) => !t.drawn)).toBe(true);
  });

  it('pulls the drawn tile to the end and marks it, leaving the rest sorted', () => {
    const out = arrangeHand([m(1), m(2), m(3)], null, 'm2');
    expect(ids(out)).toEqual(['m1', 'm3', 'm2']);
    expect(out.at(-1)).toMatchObject({ drawn: true });
    expect(out.slice(0, -1).every((t) => !t.drawn)).toBe(true);
  });

  it('respects a manual order and appends tiles not in it (sorted)', () => {
    const out = arrangeHand([m(1), m(2), m(3), p(5)], ['m3', 'm1'], null);
    expect(ids(out)).toEqual(['m3', 'm1', 'm2', 'p5']);
  });

  it('drops manual-order ids no longer in the hand', () => {
    const out = arrangeHand([m(1), m(2)], ['m9', 'm1'], null);
    expect(ids(out)).toEqual(['m1', 'm2']);
  });

  it('ignores a drawId that is not in the hand', () => {
    const out = arrangeHand([m(1), m(2)], null, 'p9');
    expect(ids(out)).toEqual(['m1', 'm2']);
    expect(out.every((t) => !t.drawn)).toBe(true);
  });

  it('highlights only the drawn copy when duplicates exist', () => {
    const out = arrangeHand([m(5), m(5), p(1)], null, 'm5');
    expect(ids(out)).toEqual(['m5', 'p1', 'm5']);
    expect(out.filter((t) => t.drawn)).toHaveLength(1);
    expect(out.at(-1)).toMatchObject({ drawn: true });
  });

  it('gives every tile a unique, stable key', () => {
    const out = arrangeHand([m(5), m(5), p(1)], null, null);
    const keys = out.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
