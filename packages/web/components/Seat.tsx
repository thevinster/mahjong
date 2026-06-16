import type { Meld, FlowerTile, Seat as SeatT } from '@mahjong/engine';
import { TileBack, Tile, tileLabel } from './Tile';

export function SeatView({
  seat, name, concealedCount, exposed, flowers, active,
}: {
  seat: SeatT;
  name: string;
  concealedCount: number;
  exposed: readonly Meld[];
  flowers: readonly FlowerTile[];
  active: boolean;
}) {
  return (
    <div style={{
      padding: '0.5rem', margin: '0.3rem',
      border: active ? '2px solid #f80' : '1px solid #ccc',
      borderRadius: 6, background: '#fafafa',
    }}>
      <div style={{ fontWeight: 'bold' }}>Seat {seat}: {name}</div>
      <div>
        {Array.from({ length: concealedCount }).map((_, i) => <TileBack key={i} />)}
      </div>
      {exposed.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 12 }}>
          Exposed: {exposed.map((m, i) => (
            <span key={i} style={{ marginRight: 6 }}>
              {m.kind}({m.kind === 'chow' ? m.tiles.map(tileLabel).join('') : tileLabel(m.tile)})
            </span>
          ))}
        </div>
      )}
      {flowers.length > 0 && (
        <div style={{ fontSize: 12, color: '#080' }}>
          Flowers: {flowers.map((f) => f.flower).join(' ')}
        </div>
      )}
    </div>
  );
}
