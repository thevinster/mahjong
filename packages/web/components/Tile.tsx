'use client';
import type { Tile as TileT } from '@mahjong/engine';
import { TileFace } from './TileFace';
import { tileFace } from '@/lib/tile-face';

/** Compact code (m1, p5, Wh…). Kept for non-visual uses / debugging. */
export function tileLabel(t: TileT): string {
  switch (t.kind) {
    case 'suit':   return `${t.suit}${t.rank}`;
    case 'honor':  return t.honor;
    case 'flower': return t.flower;
  }
}

export function Tile({
  tile, onClick, dimmed, size = 52,
}: {
  tile: TileT;
  onClick?: () => void;
  dimmed?: boolean;
  size?: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={dimmed}
      aria-label={tileFace(tile).label}
      title={tileFace(tile).label}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: 1, margin: '0.15rem', border: 'none', background: 'transparent',
        borderRadius: 8, cursor: dimmed ? 'default' : 'pointer', opacity: dimmed ? 0.4 : 1,
      }}
    >
      <TileFace tile={tile} size={size} />
    </button>
  );
}

export { TileBack } from './TileFace';
