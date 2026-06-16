import { describe, it, expect } from 'vitest';
import { tileId, parseTileId, buildDeck, sortTiles, type Tile } from '../src/tiles.js';

describe('tileId', () => {
  it('encodes suit tiles as <suit><rank>', () => {
    expect(tileId({ kind: 'suit', suit: 'm', rank: 5 })).toBe('m5');
    expect(tileId({ kind: 'suit', suit: 'p', rank: 9 })).toBe('p9');
    expect(tileId({ kind: 'suit', suit: 's', rank: 1 })).toBe('s1');
  });

  it('encodes honor tiles by honor letter', () => {
    expect(tileId({ kind: 'honor', honor: 'E' })).toBe('E');
    expect(tileId({ kind: 'honor', honor: 'Wh' })).toBe('Wh');
  });

  it('encodes flower tiles by flower code', () => {
    expect(tileId({ kind: 'flower', flower: 'F1' })).toBe('F1');
    expect(tileId({ kind: 'flower', flower: 'S4' })).toBe('S4');
  });

  it('parseTileId round-trips', () => {
    const cases: Tile[] = [
      { kind: 'suit', suit: 'm', rank: 5 },
      { kind: 'suit', suit: 's', rank: 1 },
      { kind: 'honor', honor: 'Wh' },
      { kind: 'flower', flower: 'F3' },
    ];
    for (const t of cases) {
      expect(parseTileId(tileId(t))).toEqual(t);
    }
  });

  it('parseTileId rejects garbage', () => {
    expect(() => parseTileId('x9')).toThrow();
    expect(() => parseTileId('m10')).toThrow();
  });
});

describe('buildDeck', () => {
  it('returns 144 tiles total', () => {
    expect(buildDeck()).toHaveLength(144);
  });

  it('contains 4 of each suit/honor and 1 of each flower', () => {
    const deck = buildDeck();
    const counts = new Map<string, number>();
    for (const t of deck) {
      const id = tileId(t);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    // 27 suit ids + 7 honor ids = 34 ids, each ×4 = 136
    for (const suit of ['m','p','s'] as const) {
      for (let r = 1; r <= 9; r++) {
        expect(counts.get(`${suit}${r}`)).toBe(4);
      }
    }
    for (const h of ['E','S','W','N','R','G','Wh']) {
      expect(counts.get(h)).toBe(4);
    }
    for (const f of ['F1','F2','F3','F4','S1','S2','S3','S4']) {
      expect(counts.get(f)).toBe(1);
    }
  });
});

describe('sortTiles', () => {
  it('totally orders: suits first by m<p<s then by rank; then honors; then flowers', () => {
    const unsorted: Tile[] = [
      { kind: 'flower', flower: 'F1' },
      { kind: 'honor', honor: 'E' },
      { kind: 'suit', suit: 's', rank: 1 },
      { kind: 'suit', suit: 'm', rank: 9 },
      { kind: 'suit', suit: 'p', rank: 5 },
      { kind: 'honor', honor: 'Wh' },
      { kind: 'suit', suit: 'm', rank: 1 },
    ];
    const sorted = sortTiles(unsorted);
    expect(sorted.map(tileId)).toEqual([
      'm1','m9','p5','s1','E','Wh','F1',
    ]);
  });

  it('does not mutate input', () => {
    const input: Tile[] = [
      { kind: 'suit', suit: 's', rank: 2 },
      { kind: 'suit', suit: 'm', rank: 5 },
    ];
    const before = input.map(tileId);
    sortTiles(input);
    expect(input.map(tileId)).toEqual(before);
  });
});
