import { describe, it, expect } from 'vitest';
import { tileId, parseTileId, type Tile } from '../src/tiles.js';

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
