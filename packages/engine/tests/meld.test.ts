import { describe, it, expect } from 'vitest';
import { makePong, makeChow, makeKong, isChowable } from '../src/meld.js';
import type { Tile } from '../src/tiles.js';

const m = (rank: number): Tile => ({ kind: 'suit', suit: 'm', rank: rank as 1 });
const E: Tile = { kind: 'honor', honor: 'E' };

describe('makePong', () => {
  it('requires three identical tiles', () => {
    const t = m(5);
    expect(makePong([t, t, t])).toEqual({ kind: 'pong', tile: t });
  });
  it('rejects non-identical tiles', () => {
    expect(() => makePong([m(5), m(5), m(6)])).toThrow();
  });
});

describe('makeChow', () => {
  it('builds a sequential chow in suit', () => {
    const c = makeChow([m(3), m(4), m(5)]);
    expect(c).toEqual({ kind: 'chow', tiles: [m(3), m(4), m(5)] });
  });
  it('rejects unsorted input', () => {
    expect(() => makeChow([m(4), m(3), m(5)])).toThrow();
  });
  it('rejects non-consecutive ranks', () => {
    expect(() => makeChow([m(3), m(4), m(6)])).toThrow();
  });
  it('rejects honors', () => {
    expect(() => makeChow([E, E, E] as never)).toThrow();
  });
  it('rejects mixed suits', () => {
    expect(() => makeChow([
      { kind: 'suit', suit: 'm', rank: 3 },
      { kind: 'suit', suit: 'p', rank: 4 },
      { kind: 'suit', suit: 'm', rank: 5 },
    ])).toThrow();
  });
});

describe('makeKong', () => {
  it('requires four identical tiles', () => {
    const t = m(7);
    expect(makeKong([t, t, t, t], false)).toEqual({
      kind: 'kong', tile: t, concealed: false,
    });
  });
});

describe('isChowable', () => {
  it('true for 3 sequential same-suit ranks where center is in hand', () => {
    expect(isChowable([m(3), m(4), m(5)])).toBe(true);
  });
  it('false for honors', () => {
    expect(isChowable([E, E, E])).toBe(false);
  });
});
