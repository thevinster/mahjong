import type { Tile } from '@mahjong/engine';

export type TileFaceCategory = 'man' | 'pin' | 'sou' | 'wind' | 'dragon' | 'flower';

/**
 * A render-ready description of a tile's face. Pure + exhaustively tested so the
 * SVG component (TileFace) stays dumb. `glyph` is the primary CJK character;
 * it's empty for pin/sou (drawn as pips) and the white dragon (drawn as a frame).
 */
export type TileFace = {
  category: TileFaceCategory;
  rank: number | null; // 1-9 for suited tiles, null otherwise
  glyph: string;
  color: string;       // accent colour for the face
  label: string;       // human-readable, used as the accessible name
};

const MAN_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

const WINDS: Record<string, { glyph: string; label: string }> = {
  E: { glyph: '東', label: 'East wind' },
  S: { glyph: '南', label: 'South wind' },
  W: { glyph: '西', label: 'West wind' },
  N: { glyph: '北', label: 'North wind' },
};

const DRAGONS: Record<string, { glyph: string; color: string; label: string }> = {
  R:  { glyph: '中', color: '#c0392b', label: 'Red dragon' },
  G:  { glyph: '發', color: '#1e8449', label: 'Green dragon' },
  Wh: { glyph: '',   color: '#1f6feb', label: 'White dragon' },
};

const FLOWERS: Record<string, { glyph: string; color: string; label: string }> = {
  F1: { glyph: '梅', color: '#c0392b', label: 'Plum (flower)' },
  F2: { glyph: '蘭', color: '#c0392b', label: 'Orchid (flower)' },
  F3: { glyph: '菊', color: '#c0392b', label: 'Chrysanthemum (flower)' },
  F4: { glyph: '竹', color: '#c0392b', label: 'Bamboo (flower)' },
  S1: { glyph: '春', color: '#1e8449', label: 'Spring (season)' },
  S2: { glyph: '夏', color: '#1e8449', label: 'Summer (season)' },
  S3: { glyph: '秋', color: '#1e8449', label: 'Autumn (season)' },
  S4: { glyph: '冬', color: '#1e8449', label: 'Winter (season)' },
};

const MAN_COLOR = '#b22222';
const PIN_COLOR = '#1f6feb';
const SOU_COLOR = '#1e8449';

export function tileFace(t: Tile): TileFace {
  switch (t.kind) {
    case 'suit':
      if (t.suit === 'm') {
        return { category: 'man', rank: t.rank, glyph: MAN_NUMERALS[t.rank - 1]!, color: MAN_COLOR, label: `${t.rank} of characters` };
      }
      if (t.suit === 'p') {
        return { category: 'pin', rank: t.rank, glyph: '', color: PIN_COLOR, label: `${t.rank} of circles` };
      }
      return { category: 'sou', rank: t.rank, glyph: '', color: SOU_COLOR, label: `${t.rank} of bamboo` };
    case 'honor': {
      const wind = WINDS[t.honor];
      if (wind) return { category: 'wind', rank: null, glyph: wind.glyph, color: '#222', label: wind.label };
      const dragon = DRAGONS[t.honor]!;
      return { category: 'dragon', rank: null, glyph: dragon.glyph, color: dragon.color, label: dragon.label };
    }
    case 'flower': {
      const f = FLOWERS[t.flower]!;
      return { category: 'flower', rank: null, glyph: f.glyph, color: f.color, label: f.label };
    }
  }
}
