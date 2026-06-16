import { describe, it, expect } from 'vitest';
import {
  emptyHand, addTile, removeTile, sortedConcealed, countTile, type Hand,
} from '../src/hand.js';
import type { Tile } from '../src/tiles.js';

const m = (r: number): Tile => ({ kind: 'suit', suit: 'm', rank: r as 1 });

describe('emptyHand', () => {
  it('starts with empty slices', () => {
    const h = emptyHand();
    expect(h.concealed).toEqual([]);
    expect(h.exposed).toEqual([]);
    expect(h.flowers).toEqual([]);
  });
});

describe('addTile / removeTile', () => {
  it('adds and removes one tile preserving other slices', () => {
    let h: Hand = emptyHand();
    h = addTile(h, m(5));
    expect(h.concealed).toHaveLength(1);
    h = removeTile(h, m(5));
    expect(h.concealed).toEqual([]);
  });
  it('removeTile throws if tile is not in hand', () => {
    expect(() => removeTile(emptyHand(), m(5))).toThrow();
  });
  it('returns a new object (no mutation)', () => {
    const h = emptyHand();
    const h2 = addTile(h, m(5));
    expect(h).not.toBe(h2);
    expect(h.concealed).toEqual([]);
  });
});

describe('sortedConcealed', () => {
  it('returns concealed sorted', () => {
    let h = emptyHand();
    h = addTile(h, m(5));
    h = addTile(h, m(1));
    h = addTile(h, m(9));
    expect(sortedConcealed(h).map((t) => (t as { rank: number }).rank))
      .toEqual([1, 5, 9]);
  });
});

describe('countTile', () => {
  it('counts occurrences in concealed', () => {
    let h = emptyHand();
    h = addTile(h, m(5));
    h = addTile(h, m(5));
    h = addTile(h, m(7));
    expect(countTile(h, m(5))).toBe(2);
    expect(countTile(h, m(7))).toBe(1);
    expect(countTile(h, m(8))).toBe(0);
  });
});
