import type { Seat, Tile as TileT } from '@mahjong/engine';
import { tileLabel } from './Tile';

export function Discards({ discards }: { discards: readonly { seat: Seat; tile: TileT }[] }) {
  return (
    <div style={{ padding: '0.5rem', background: '#eee', borderRadius: 6, margin: '0.3rem' }}>
      <div style={{ fontSize: 12, color: '#666' }}>River ({discards.length} discards)</div>
      <div style={{ fontFamily: 'monospace' }}>
        {discards.map((d, i) => (
          <span key={i} style={{ marginRight: 4 }}>{tileLabel(d.tile)}</span>
        ))}
      </div>
    </div>
  );
}
