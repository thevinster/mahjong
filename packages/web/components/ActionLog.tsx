'use client';
import { meldTiles, type Event } from '@mahjong/engine';
import { useGame } from '@/hooks/useGame';
import { TileFace } from './TileFace';
import { theme } from '@/lib/theme';

export function ActionLog() {
  const log = useGame((s) => s.log);
  return (
    <div style={{
      padding: '0.5rem 0.6rem', background: theme.panel,
      border: `1px solid ${theme.panelBorder}`, borderRadius: 12,
      height: 150, overflowY: 'auto', fontSize: 12.5, color: theme.ink,
    }}>
      <div style={{
        fontWeight: 700, marginBottom: 4, color: theme.inkDim,
        fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>
        Log
      </div>
      {log.slice(-60).map((e) => (
        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
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
