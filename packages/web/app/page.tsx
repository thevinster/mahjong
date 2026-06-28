'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { theme } from '@/lib/theme';

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
    <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{
        width: 'min(480px, 96vw)', padding: '2rem', borderRadius: 18,
        background: theme.panel, border: `1px solid ${theme.panelBorder}`,
        boxShadow: '0 24px 70px rgba(0,0,0,0.5)', textAlign: 'center',
      }}>
        <h1 style={{ margin: 0, fontSize: 40, color: theme.gold }}>🀄 Mahjong</h1>
        <p style={{ color: theme.inkDim, marginTop: 8 }}>Online 4-player Taiwanese mahjong. Bots fill empty seats.</p>

        <section style={{ marginTop: '1.75rem' }}>
          <button onClick={createRoom} disabled={creating} style={primaryBtn}>
            {creating ? 'Creating…' : 'Create a new room'}
          </button>
        </section>

        <section style={{ marginTop: '2rem', textAlign: 'left' }}>
          <h2 style={{ fontSize: 14, color: theme.inkDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Join a friend&apos;s room</h2>
          <input
            type="text" placeholder="ABCD" value={code} maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ ...input, letterSpacing: '0.3em', textAlign: 'center', fontWeight: 700 }}
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

        {err && <p style={{ color: '#f0918a' }}>{err}</p>}
      </div>
    </main>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: '0.7rem 1.5rem', background: theme.gold, color: '#2a2113', border: 'none',
  borderRadius: 999, fontSize: 16, fontWeight: 700, cursor: 'pointer', width: '100%',
};
const secondaryBtn: React.CSSProperties = {
  ...primaryBtn, background: 'rgba(255,255,255,0.1)', color: theme.ink,
  border: `1px solid ${theme.panelBorder}`,
};
const input: React.CSSProperties = {
  display: 'block', margin: '0.5rem 0', padding: '0.6rem', fontSize: 16, width: '100%', boxSizing: 'border-box',
  borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.95)', color: '#23304a',
};
