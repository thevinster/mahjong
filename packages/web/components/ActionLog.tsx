'use client';
import { meldTiles, type Event } from '@mahjong/engine';
import { useGame } from '@/hooks/useGame';
import { TileFace } from './TileFace';

export function ActionLog() {
  const log = useGame((s) => s.log);
  return (
    <div style={{
      padding: '0.5rem', background: '#fffef0', border: '1px solid #ddc',
      borderRadius: 6, height: 220, overflowY: 'auto', fontSize: 13,
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Log</div>
      {log.slice(-60).map((e) => (
        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', borderBottom: '1px solid #f1eccf' }}>
          <EventRow ev={e.ev} />
        </div>
      ))}
    </div>
  );
}

function EventRow({ ev }: { ev: Event }) {
  switch (ev.t) {
    case 'dealt':    return <span>Hand dealt</span>;
    case 'drew':     return <span>Seat {ev.seat} drew a tile</span>;
    case 'drawWall': return <span>Wall exhausted — washout</span>;
    case 'discarded':
      return <><span>Seat {ev.seat} discarded</span><TileFace tile={ev.tile} size={24} /></>;
    case 'flowerReplaced':
      return <><span>Seat {ev.seat} drew a flower</span><TileFace tile={ev.flower} size={24} /></>;
    case 'melded':
      return (
        <>
          <span>Seat {ev.seat} {ev.meld.kind}</span>
          {meldTiles(ev.meld).map((t, i) => <TileFace key={i} tile={t} size={22} />)}
        </>
      );
    case 'won':
      return <span>Seat {ev.seat} won — {ev.score} tai {ev.from === 'self' ? '(self-draw)' : `off Seat ${ev.from}`}</span>;
  }
}
