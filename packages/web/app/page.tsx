'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function createRoom() {
    setCreating(true); setErr(null);
    try {
      const r = await fetch('/api/rooms', { method: 'POST' });
      const body = await r.json();
      router.push(`/room/${body.roomCode}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function joinRoom() {
    if (code.length !== 4) { setErr('Room code is 4 characters'); return; }
    setJoining(true); setErr(null);
    try {
      const r = await fetch(`/api/rooms/${code.toUpperCase()}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: name || 'Player' }),
      });
      if (!r.ok) {
        const body = await r.json();
        setErr(body.error ?? `HTTP ${r.status}`);
        return;
      }
      router.push(`/room/${code.toUpperCase()}`);
    } finally {
      setJoining(false);
    }
  }

  return (
    <main style={{ maxWidth: 500, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Mahjong</h1>
      <p style={{ color: '#555' }}>Online 4-player Taiwanese mahjong. Bots fill empty seats.</p>

      <section style={{ marginTop: '2rem' }}>
        <button onClick={createRoom} disabled={creating} style={primaryBtn}>
          {creating ? 'Creating…' : 'Create a new room'}
        </button>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: 16 }}>Join a friend's room</h2>
        <input
          type="text" placeholder="ABCD" value={code} maxLength={4}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          style={input}
        />
        <input
          type="text" placeholder="Your name" value={name}
          onChange={(e) => setName(e.target.value)}
          style={input}
        />
        <button onClick={joinRoom} disabled={joining || code.length !== 4} style={secondaryBtn}>
          {joining ? 'Joining…' : 'Join room'}
        </button>
      </section>

      {err && <p style={{ color: '#c33' }}>{err}</p>}
    </main>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: '0.7rem 1.5rem', background: '#5a5', color: 'white', border: 'none',
  borderRadius: 6, fontSize: 16, cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = { ...primaryBtn, background: '#358' };
const input: React.CSSProperties = {
  display: 'block', margin: '0.5rem 0', padding: '0.5rem', fontSize: 16, width: '100%', boxSizing: 'border-box',
};
