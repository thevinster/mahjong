import type { Tile } from '@mahjong/engine';
import { tileFace, type TileFace as TileFaceSpec } from '@/lib/tile-face';

// Pip positions (viewBox 60x80) for dots/bamboo, by rank.
const PIPS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[30, 40]],
  2: [[30, 26], [30, 54]],
  3: [[18, 24], [30, 40], [42, 56]],
  4: [[20, 26], [40, 26], [20, 54], [40, 54]],
  5: [[20, 24], [40, 24], [30, 40], [20, 56], [40, 56]],
  6: [[20, 24], [40, 24], [20, 40], [40, 40], [20, 56], [40, 56]],
  7: [[16, 22], [30, 22], [44, 22], [20, 40], [40, 40], [20, 56], [40, 56]],
  8: [[20, 20], [40, 20], [20, 34], [40, 34], [20, 48], [40, 48], [20, 62], [40, 62]],
  9: [[16, 22], [30, 22], [44, 22], [16, 40], [30, 40], [44, 40], [16, 58], [30, 58], [44, 58]],
};

const CJK = "'Hiragino Sans GB','Songti SC','Noto Serif CJK SC','Noto Sans CJK SC','Microsoft YaHei',serif";

export function TileFace({ tile, size = 48 }: { tile: Tile; size?: number }) {
  const f = tileFace(tile);
  const width = Math.round(size * 0.72);
  return (
    <svg
      width={width} height={size} viewBox="0 0 60 80"
      role="img" aria-label={f.label}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <title>{f.label}</title>
      {/* faux thickness + tile body */}
      <rect x="3.5" y="4.5" width="55" height="74" rx="8" fill="#d8d2c2" />
      <rect x="2" y="2" width="55" height="74" rx="8" fill="#fbfaf5" stroke="#b9b2a0" strokeWidth="1.4" />
      <Face f={f} />
    </svg>
  );
}

function Face({ f }: { f: TileFaceSpec }) {
  switch (f.category) {
    case 'man':
      return (
        <>
          <text x="30" y="30" textAnchor="middle" dominantBaseline="central" fontFamily={CJK} fontSize="30" fontWeight={700} fill="#1f3a93">{f.glyph}</text>
          <text x="30" y="58" textAnchor="middle" dominantBaseline="central" fontFamily={CJK} fontSize="22" fontWeight={700} fill="#b22222">萬</text>
        </>
      );
    case 'wind':
      return <text x="30" y="42" textAnchor="middle" dominantBaseline="central" fontFamily={CJK} fontSize="42" fontWeight={700} fill={f.color}>{f.glyph}</text>;
    case 'dragon':
      if (!f.glyph) {
        // White dragon — traditional blue frame.
        return <rect x="14" y="18" width="32" height="44" rx="4" fill="none" stroke={f.color} strokeWidth="3" />;
      }
      return <text x="30" y="42" textAnchor="middle" dominantBaseline="central" fontFamily={CJK} fontSize="40" fontWeight={700} fill={f.color}>{f.glyph}</text>;
    case 'flower':
      return <text x="30" y="42" textAnchor="middle" dominantBaseline="central" fontFamily={CJK} fontSize="34" fontWeight={700} fill={f.color}>{f.glyph}</text>;
    case 'pin':
      return (
        <>
          {(PIPS[f.rank ?? 0] ?? []).map(([cx, cy], i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r="6.4" fill="#ffffff" stroke={f.color} strokeWidth="1.6" />
              <circle cx={cx} cy={cy} r="3" fill={f.color} />
            </g>
          ))}
        </>
      );
    case 'sou':
      return (
        <>
          {(PIPS[f.rank ?? 0] ?? []).map(([cx, cy], i) => (
            <g key={i}>
              <rect x={cx - 3.5} y={cy - 8} width="7" height="16" rx="3" fill={f.color} />
              <rect x={cx - 3.5} y={cy - 1} width="7" height="2" fill="rgba(255,255,255,0.65)" />
            </g>
          ))}
        </>
      );
  }
}

export function TileBack({ size = 48 }: { size?: number }) {
  const width = Math.round(size * 0.72);
  return (
    <svg
      width={width} height={size} viewBox="0 0 60 80"
      role="img" aria-label="Hidden tile"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <title>Hidden tile</title>
      <rect x="3.5" y="4.5" width="55" height="74" rx="8" fill="#16442a" />
      <rect x="2" y="2" width="55" height="74" rx="8" fill="#2e8b57" stroke="#16442a" strokeWidth="1.4" />
      <rect x="11" y="13" width="38" height="54" rx="6" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
      <circle cx="30" cy="40" r="8" fill="rgba(255,255,255,0.22)" />
    </svg>
  );
}
