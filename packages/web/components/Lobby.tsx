'use client';
import { useState } from 'react';
import type { Seat } from '@mahjong/engine';
import type { SeatPublic } from '@/lib/protocol';

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
    <main style={{ maxWidth: 560, margin: '3rem auto', padding: '0 1rem' }}>
      <h1>Room {code}</h1>
      <p style={{ color: '#555' }}>
        Share this code so friends can join. Empty seats are filled with bots when the host starts —
        so you can play solo right now, or wait for up to 3 others.
      </p>
      <button onClick={() => void navigator.clipboard?.writeText(code)} style={ghostBtn}>
        Copy code
      </button>

      <ul style={{ listStyle: 'none', padding: 0, marginTop: '1.5rem' }}>
        {seats.map((s) => (
          <li key={s.seat} style={rosterRow}>
            <span style={{ width: 56, color: '#888' }}>Seat {s.seat}</span>
            <span style={{ flex: 1 }}>{seatLabel(s, viewerSeat)}</span>
            {s.kind === 'human' && (
              <span style={{ color: s.connected ? '#2a2' : '#c93', fontSize: 12 }}>
                {s.connected ? '● online' : '○ away'}
              </span>
            )}
          </li>
        ))}
      </ul>

      {viewerSeat === null ? (
        <section style={{ marginTop: '1rem' }}>
          <p>You're not seated yet.</p>
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
        <p style={{ marginTop: '1rem', color: '#777' }}>Waiting for the host to start the hand…</p>
      )}
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
  padding: '0.7rem 1.5rem', background: '#5a5', color: 'white', border: 'none',
  borderRadius: 6, fontSize: 16, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  padding: '0.3rem 0.8rem', background: '#eee', border: '1px solid #ccc',
  borderRadius: 6, fontSize: 13, cursor: 'pointer',
};
const rosterRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '0.5rem', borderBottom: '1px solid #eee',
};
const input: React.CSSProperties = {
  display: 'block', margin: '0.5rem 0', padding: '0.5rem', fontSize: 16, width: '100%', boxSizing: 'border-box',
};
