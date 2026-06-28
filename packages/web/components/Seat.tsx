import type { Meld, FlowerTile, Seat as SeatT } from '@mahjong/engine';
import { meldTiles } from '@mahjong/engine';
import { TileFace, TileBack } from './TileFace';
import { theme, namePlate } from '@/lib/theme';

export type SeatOrientation = 'self' | 'top' | 'left' | 'right';

/**
 * A player's area on the table. Opponents (top/left/right) show a fanned row of
 * face-down tiles; the viewer ('self') hides the backs (their real hand renders
 * separately) and just shows their name, melds and flowers. Exposed melds and
 * flowers are always face-up. Glows gold on the active seat.
 */
export function SeatView({
  seat, name, concealedCount, exposed, flowers, active, orientation = 'top',
}: {
  seat: SeatT;
  name: string;
  concealedCount: number;
  exposed: readonly Meld[];
  flowers: readonly FlowerTile[];
  active: boolean;
  orientation?: SeatOrientation;
}) {
  const isSelf = orientation === 'self';
  const isSide = orientation === 'left' || orientation === 'right';
  const backSize = 26;
  const overlap = -Math.round(backSize * 0.72 * 0.5); // tight fan
  const meldSize = isSelf ? 30 : 24;
  const flowerSize = isSelf ? 28 : 22;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center',
      padding: '8px 10px', borderRadius: 12,
      background: 'rgba(6,26,17,0.30)',
      border: `1px solid ${active ? theme.gold : 'rgba(255,255,255,0.08)'}`,
      boxShadow: active ? `0 0 18px ${theme.goldSoft}` : 'none',
      maxWidth: isSide ? 190 : undefined,
    }}>
      <div style={namePlate(active)}>
        {active && <span aria-hidden>🀄</span>}
        <span>{name}</span>
        {!isSelf && <span style={{ opacity: 0.7, fontWeight: 500 }}>· {concealedCount}</span>}
      </div>

      {!isSelf && concealedCount > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', maxWidth: isSide ? 170 : undefined }}>
          {Array.from({ length: concealedCount }).map((_, i) => (
            <div key={i} style={{ marginLeft: i === 0 ? 0 : overlap }}>
              <TileBack size={backSize} />
            </div>
          ))}
        </div>
      )}

      {exposed.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {exposed.map((m, i) => (
            <span key={i} style={{ display: 'inline-flex', gap: 1 }}>
              {meldTiles(m).map((t, j) => <TileFace key={j} tile={t} size={meldSize} />)}
            </span>
          ))}
        </div>
      )}

      {flowers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
          {flowers.map((f, i) => <TileFace key={i} tile={f} size={flowerSize} />)}
        </div>
      )}
    </div>
  );
}
