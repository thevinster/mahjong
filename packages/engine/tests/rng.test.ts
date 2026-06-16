import { describe, it, expect } from 'vitest';
import { seededRng, shuffle } from '../src/rng.js';

describe('seededRng', () => {
  it('produces identical sequences for the same seed', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('returns values in [0, 1)', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('shuffle', () => {
  it('is a permutation', () => {
    const rng = seededRng(1);
    const input = Array.from({ length: 20 }, (_, i) => i);
    const out = shuffle(input, rng);
    expect(out).toHaveLength(20);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it('is deterministic per seed', () => {
    const input = Array.from({ length: 50 }, (_, i) => i);
    const a = shuffle(input, seededRng(123));
    const b = shuffle(input, seededRng(123));
    expect(a).toEqual(b);
  });

  it('does not mutate input', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input, seededRng(9));
    expect(input).toEqual(copy);
  });
});
