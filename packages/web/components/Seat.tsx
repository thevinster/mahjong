import type { Meld, FlowerTile, Seat as SeatT } from '@mahjong/engine';
import { meldTiles } from '@mahjong/engine';
import { TileFace, TileBack } from './TileFace';

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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1, marginTop: 4 }}>
        {Array.from({ length: concealedCount }).map((_, i) => <TileBack key={i} size={30} />)}
      </div>
      {exposed.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {exposed.map((m, i) => (
            <span key={i} style={{ display: 'inline-flex', gap: 1 }}>
              {meldTiles(m).map((t, j) => <TileFace key={j} tile={t} size={28} />)}
            </span>
          ))}
        </div>
      )}
      {flowers.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {flowers.map((f, i) => <TileFace key={i} tile={f} size={28} />)}
        </div>
      )}
    </div>
  );
}
