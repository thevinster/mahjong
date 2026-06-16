'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Hand } from '@/components/Hand';
import { SeatView } from '@/components/Seat';
import { Discards } from '@/components/Discards';
import { ActionBar } from '@/components/ActionBar';
import { ActionLog } from '@/components/ActionLog';
import { useGame } from '@/hooks/useGame';
import { usePusherRoom } from '@/hooks/usePusherRoom';
import { tileLabel } from '@/components/Tile';
import { viewerLegalIntents } from '@/lib/client-legal';
import type { Intent, Seat, Tile as TileT } from '@mahjong/engine';

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = params?.code ?? '';
  const [mySeat, setMySeat] = useState<Seat | null>(null);
  const [legal, setLegal] = useState<Intent[]>([]);
  const [starting, setStarting] = useState(false);
  const state = useGame((s) => s.state);

  // Resolve mySeat by fetching snapshot (snapshot's viewer field)
  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/rooms/${code}/snapshot`);
      if (!r.ok) {
        setMySeat(null);
        return;
      }
      const snap = await r.json();
      setMySeat(snap.viewer);
    })();
  }, [code]);

  usePusherRoom(code, mySeat ?? 0); // subscribes; harmless if mySeat null briefly

  // After every snapshot/event change, compute legal intents client-side
  useEffect(() => {
    if (!state) { setLegal([]); return; }
    setLegal(viewerLegalIntents(state));
  }, [state]);

  async function send(intent: Intent) {
    await fetch(`/api/rooms/${code}/intent`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intent }),
    });
    // Legal intents are recomputed automatically via the state effect when Pusher updates arrive
  }

  async function startRoom() {
    setStarting(true);
    try {
      await fetch(`/api/rooms/${code}/start`, { method: 'POST' });
    } finally {
      setStarting(false);
    }
  }

  if (mySeat === null) {
    return <main style={{ padding: '2rem' }}>Loading room {code}…</main>;
  }

  if (!state) {
    return (
      <main style={{ padding: '2rem', maxWidth: 600, margin: '0 auto' }}>
        <h1>Room {code}</h1>
        <p>Waiting in lobby. Share this URL with friends, then click Start.</p>
        <button onClick={startRoom} disabled={starting} style={{ padding: '0.7rem 1.5rem' }}>
          {starting ? 'Starting…' : 'Start hand (fill empty seats with bots)'}
        </button>
      </main>
    );
  }

  const myHand = state.hands[mySeat];
  const ownTiles = myHand.own ? myHand.concealed : [];
  const legalDiscards = new Set(legal.filter((i) => i.t === 'discard').map((i) => tileKey((i as Extract<Intent, { t: 'discard' }>).tile)));

  return (
    <main style={{ padding: '1rem', maxWidth: 1000, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>Room {code}</h2>
        <span>Wall: {state.wallRemaining}</span>
      </header>
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {[0, 1, 2, 3].map((s) => {
          const seat = s as Seat;
          const h = state.hands[seat];
          const active = state.phase.t === 'awaitDiscard' && state.phase.seat === seat;
          return (
            <SeatView
              key={seat}
              seat={seat}
              name={seat === mySeat ? 'You' : `Seat ${seat}`}
              concealedCount={h.own ? h.concealed.length : h.concealedCount}
              exposed={h.exposed}
              flowers={h.flowers}
              active={active}
            />
          );
        })}
      </section>
      <Discards discards={state.discards} />
      <Hand tiles={ownTiles} legalDiscards={legalDiscards} onDiscard={(t) => send({ t: 'discard', seat: mySeat, tile: t })} />
      <ActionBar legalIntents={legal.filter((i) => i.t !== 'discard')} onIntent={send} />
      <ActionLog />
      {state.phase.t === 'ended' && (
        <div style={{ marginTop: 16, padding: 12, background: '#dfd', borderRadius: 6 }}>
          <h3>Hand ended {state.phase.winner === null ? '(draw)' : `— winner: seat ${state.phase.winner}`}</h3>
          <pre>{JSON.stringify(state.phase.score, null, 2)}</pre>
        </div>
      )}
    </main>
  );
}

function tileKey(t: TileT): string {
  switch (t.kind) {
    case 'suit':   return `suit:${t.suit}${t.rank}`;
    case 'honor':  return `honor:${t.honor}`;
    case 'flower': return `flower:${t.flower}`;
  }
}
