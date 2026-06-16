'use client';
import { Tile } from './Tile';
import type { Tile as TileT } from '@mahjong/engine';

export function Hand({
  tiles, legalDiscards, onDiscard,
}: {
  tiles: readonly TileT[];
  legalDiscards: ReadonlySet<string>;
  onDiscard: (t: TileT) => void;
}) {
  return (
    <div style={{ padding: '0.5rem', borderTop: '2px solid #333' }}>
      <div style={{ fontSize: 12, color: '#666' }}>Your hand ({tiles.length} tiles)</div>
      <div>
        {tiles.map((t, i) => {
          const id = `${t.kind}:${t.kind === 'suit' ? `${t.suit}${t.rank}` : t.kind === 'honor' ? t.honor : t.flower}`;
          return (
            <Tile key={`${id}-${i}`} tile={t} onClick={() => onDiscard(t)} dimmed={!legalDiscards.has(id)} />
          );
        })}
      </div>
    </div>
  );
}
