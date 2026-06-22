import type { Seat, Tile as TileT } from '@mahjong/engine';
import { TileFace } from './TileFace';

export function Discards({ discards }: { discards: readonly { seat: Seat; tile: TileT }[] }) {
  return (
    <div style={{ padding: '0.5rem', background: '#eee', borderRadius: 6, margin: '0.3rem' }}>
      <div style={{ fontSize: 12, color: '#666' }}>River ({discards.length} discards)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 4 }}>
        {discards.map((d, i) => (
          <TileFace key={i} tile={d.tile} size={34} />
        ))}
      </div>
    </div>
  );
}
