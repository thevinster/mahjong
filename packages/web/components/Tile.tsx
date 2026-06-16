import type { Tile as TileT } from '@mahjong/engine';

export function tileLabel(t: TileT): string {
  switch (t.kind) {
    case 'suit':   return `${t.suit}${t.rank}`;
    case 'honor':  return t.honor;
    case 'flower': return t.flower;
  }
}

export function Tile({ tile, onClick, dimmed }: { tile: TileT; onClick?: () => void; dimmed?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={dimmed}
      style={{
        display: 'inline-block', padding: '0.4rem 0.6rem', margin: '0.1rem',
        border: '1px solid #888', borderRadius: 4, background: dimmed ? '#eee' : '#fff',
        cursor: dimmed ? 'default' : 'pointer', fontFamily: 'monospace', minWidth: 32,
      }}
    >
      {tileLabel(tile)}
    </button>
  );
}

export function TileBack() {
  return (
    <span style={{
      display: 'inline-block', padding: '0.4rem 0.6rem', margin: '0.1rem',
      border: '1px solid #888', borderRadius: 4, background: '#c8d',
      minWidth: 32, fontFamily: 'monospace', color: 'transparent',
    }}>??</span>
  );
}
