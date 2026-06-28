'use client';
import { useState } from 'react';
import type { Seat } from '@mahjong/engine';
import type { SeatPublic } from '@/lib/protocol';
import { theme } from '@/lib/theme';

export function Lobby({
  code, seats, viewerSeat, isHost, starting, onStart, joining, onJoin,
}: {
  code: string;
  seats: readonly SeatPublic[];
  viewerSeat: Seat | null;
  isHost: boolean;
  starting: boolean;
  onStart: () => void;
  joining: boolean;
  onJoin: (displayName: string) => void;
}) {
  const [name, setName] = useState('');
  const humans = seats.filter((s) => s.kind === 'human').length;

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{
        width: 'min(560px, 96vw)', padding: '1.75rem 2rem', borderRadius: 18,
        background: theme.panel, border: `1px solid ${theme.panelBorder}`,
        boxShadow: '0 24px 70px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ margin: 0, color: theme.gold }}>🀄 Room</h1>
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '0.25em', fontFamily: 'ui-monospace, monospace' }}>{code}</span>
        </div>
        <p style={{ color: theme.inkDim, marginTop: 8 }}>
          Share this code so friends can join. Empty seats are filled with bots when the host starts —
          so you can play solo right now, or wait for up to 3 others.
        </p>
        <button onClick={() => void navigator.clipboard?.writeText(code)} style={ghostBtn}>
          Copy code
        </button>

        <ul style={{ listStyle: 'none', padding: 0, marginTop: '1.5rem' }}>
          {seats.map((s) => (
            <li key={s.seat} style={rosterRow}>
              <span style={{ width: 56, color: theme.inkDim }}>Seat {s.seat}</span>
              <span style={{ flex: 1 }}>{seatLabel(s, viewerSeat)}</span>
              {s.kind === 'human' && (
                <span style={{ color: s.connected ? '#7ee2a0' : theme.gold, fontSize: 12 }}>
                  {s.connected ? '● online' : '○ away'}
                </span>
              )}
            </li>
          ))}
        </ul>

        {viewerSeat === null ? (
          <section style={{ marginTop: '1rem' }}>
            <p style={{ color: theme.inkDim }}>You&apos;re not seated yet.</p>
            <input
              type="text" placeholder="Your name" value={name}
              onChange={(e) => setName(e.target.value)} style={input}
            />
            <button onClick={() => onJoin(name || 'Player')} disabled={joining} style={primaryBtn}>
              {joining ? 'Joining…' : 'Take a seat'}
            </button>
          </section>
        ) : isHost ? (
          <section style={{ marginTop: '1rem' }}>
            <button onClick={onStart} disabled={starting} style={primaryBtn}>
              {starting ? 'Starting…' : `Start hand (${humans} human${humans === 1 ? '' : 's'}, rest bots)`}
            </button>
          </section>
        ) : (
          <p style={{ marginTop: '1rem', color: theme.inkDim }}>Waiting for the host to start the hand…</p>
        )}
      </div>
    </main>
  );
}

function seatLabel(s: SeatPublic, viewerSeat: Seat | null): string {
  if (s.seat === viewerSeat) return `${s.name ?? 'You'} (you)`;
  if (s.kind === 'human') return s.name ?? 'Player';
  if (s.kind === 'bot') return 'Bot';
  return 'empty → bot';
}

const primaryBtn: React.CSSProperties = {
  padding: '0.7rem 1.5rem', background: theme.gold, color: '#2a2113', border: 'none',
  borderRadius: 999, fontSize: 16, fontWeight: 700, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  padding: '0.35rem 0.9rem', background: 'rgba(255,255,255,0.08)', color: theme.ink,
  border: `1px solid ${theme.panelBorder}`, borderRadius: 999, fontSize: 13, cursor: 'pointer',
};
const rosterRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)',
};
const input: React.CSSProperties = {
  display: 'block', margin: '0.5rem 0', padding: '0.6rem', fontSize: 16, width: '100%', boxSizing: 'border-box',
  borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.95)', color: '#23304a',
};
