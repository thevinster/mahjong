import type { Seat, Tile as TileT } from '@mahjong/engine';
import { TileFace } from './TileFace';
import { theme } from '@/lib/theme';

/** The central river — discarded tiles pooled in the middle of the table. */
export function Discards({ discards }: { discards: readonly { seat: Seat; tile: TileT }[] }) {
  return (
    <div style={{
      flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      padding: '8px 10px', borderRadius: 16,
      background: 'rgba(5,22,14,0.42)',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: 'inset 0 2px 14px rgba(0,0,0,0.4)',
    }}>
      <div style={{
        fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: theme.inkDim, marginBottom: 6,
      }}>
        River · {discards.length}
      </div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 3,
        alignContent: 'flex-start', overflowY: 'auto', justifyContent: 'center',
      }}>
        {discards.map((d, i) => <TileFace key={i} tile={d.tile} size={38} />)}
      </div>
    </div>
  );
}
