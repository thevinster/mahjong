import { describe, it, expect } from 'vitest';
import { tileFace } from '../lib/tile-face';
import type { Tile, Suit, Honor, Flower, Rank } from '@mahjong/engine';

describe('tileFace', () => {
  it('maps character (man) tiles to the right numeral + label', () => {
    expect(tileFace({ kind: 'suit', suit: 'm', rank: 5 })).toMatchObject({
      category: 'man', rank: 5, glyph: '五', label: '5 of characters',
    });
    expect(tileFace({ kind: 'suit', suit: 'm', rank: 1 }).glyph).toBe('一');
    expect(tileFace({ kind: 'suit', suit: 'm', rank: 9 }).glyph).toBe('九');
  });

  it('maps dots (pin) and bamboo (sou), keeping rank for pip rendering', () => {
    expect(tileFace({ kind: 'suit', suit: 'p', rank: 3 })).toMatchObject({ category: 'pin', rank: 3, label: '3 of circles' });
    expect(tileFace({ kind: 'suit', suit: 's', rank: 7 })).toMatchObject({ category: 'sou', rank: 7, label: '7 of bamboo' });
  });

  it('maps the four winds', () => {
    expect(tileFace({ kind: 'honor', honor: 'E' })).toMatchObject({ category: 'wind', glyph: '東', label: 'East wind' });
    expect(tileFace({ kind: 'honor', honor: 'S' }).glyph).toBe('南');
    expect(tileFace({ kind: 'honor', honor: 'W' }).glyph).toBe('西');
    expect(tileFace({ kind: 'honor', honor: 'N' }).glyph).toBe('北');
  });

  it('maps the three dragons with colors', () => {
    expect(tileFace({ kind: 'honor', honor: 'R' })).toMatchObject({ category: 'dragon', glyph: '中', label: 'Red dragon' });
    expect(tileFace({ kind: 'honor', honor: 'G' })).toMatchObject({ category: 'dragon', glyph: '發', label: 'Green dragon' });
    expect(tileFace({ kind: 'honor', honor: 'Wh' })).toMatchObject({ category: 'dragon', label: 'White dragon' });
  });

  it('maps flowers and seasons', () => {
    expect(tileFace({ kind: 'flower', flower: 'F1' })).toMatchObject({ category: 'flower', glyph: '梅', label: 'Plum (flower)' });
    expect(tileFace({ kind: 'flower', flower: 'F4' }).glyph).toBe('竹');
    expect(tileFace({ kind: 'flower', flower: 'S1' })).toMatchObject({ category: 'flower', glyph: '春', label: 'Spring (season)' });
    expect(tileFace({ kind: 'flower', flower: 'S4' }).glyph).toBe('冬');
  });

  it('covers every distinct tile with a non-empty label and a valid category', () => {
    const tiles: Tile[] = [];
    for (const suit of ['m', 'p', 's'] as Suit[]) {
      for (let r = 1; r <= 9; r++) tiles.push({ kind: 'suit', suit, rank: r as Rank });
    }
    for (const h of ['E', 'S', 'W', 'N', 'R', 'G', 'Wh'] as Honor[]) tiles.push({ kind: 'honor', honor: h });
    for (const f of ['F1', 'F2', 'F3', 'F4', 'S1', 'S2', 'S3', 'S4'] as Flower[]) tiles.push({ kind: 'flower', flower: f });

    for (const t of tiles) {
      const face = tileFace(t);
      expect(face.label.length).toBeGreaterThan(0);
      expect(['man', 'pin', 'sou', 'wind', 'dragon', 'flower']).toContain(face.category);
      expect(typeof face.color).toBe('string');
    }
    expect(tiles).toHaveLength(34 + 8); // 27 suited + 7 honors + 8 flowers
  });
});
