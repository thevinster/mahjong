'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Hand } from '@/components/Hand';
import { SeatView } from '@/components/Seat';
import { Discards } from '@/components/Discards';
import { ActionBar } from '@/components/ActionBar';
import { ActionLog } from '@/components/ActionLog';
import { Lobby } from '@/components/Lobby';
import { useGame } from '@/hooks/useGame';
import { usePusherRoom } from '@/hooks/usePusherRoom';
import { viewerLegalIntents } from '@/lib/client-legal';
import type { Intent, Seat, Tile as TileT } from '@mahjong/engine';

const TICK_MS = 8000;

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = params?.code ?? '';

  const snapshot = useGame((s) => s.snapshot);
  const setSnapshot = useGame((s) => s.setSnapshot);

  const viewerSeat = snapshot?.viewerSeat ?? null;
  const state = snapshot?.state ?? null;
  const phase = snapshot?.phase ?? null;

  const [legal, setLegal] = useState<Intent[]>([]);
  const [starting, setStarting] = useState(false);
  const [joining, setJoining] = useState(false);

  usePusherRoom(code, viewerSeat);

  const refetch = useCallback(async () => {
    const r = await fetch(`/api/rooms/${code}/snapshot`);
    if (r.ok) setSnapshot(await r.json());
  }, [code, setSnapshot]);

  // Recompute legal intents whenever our view of the game changes.
  useEffect(() => {
    setLegal(state ? viewerLegalIntents(state) : []);
  }, [state]);

  // Best-effort "I'm leaving" beacon so the server starts our grace timer.
  useEffect(() => {
    if (!code) return;
    const onHide = () => { navigator.sendBeacon?.(`/api/rooms/${code}/leave`); };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [code]);

  // Serverless has no timers: while a human is away, nudge the room so their
  // grace can expire and a bot can take over. Cheap 204 no-op otherwise.
  const someoneAway = !!snapshot?.seats.some((s) => s.kind === 'human' && !s.connected);
  useEffect(() => {
    if (phase !== 'playing' || !someoneAway) return;
    const id = setInterval(() => { void fetch(`/api/rooms/${code}/tick`, { method: 'POST' }); }, TICK_MS);
    return () => clearInterval(id);
  }, [phase, someoneAway, code]);

  async function send(intent: Intent) {
    await fetch(`/api/rooms/${code}/intent`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intent }),
    });
    await refetch();
  }

  async function startRoom() {
    setStarting(true);
    try {
      await fetch(`/api/rooms/${code}/start`, { method: 'POST' });
      await refetch();
    } finally {
      setStarting(false);
    }
  }

  async function joinRoom(displayName: string) {
    setJoining(true);
    try {
      await fetch(`/api/rooms/${code}/join`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      await refetch();
    } finally {
      setJoining(false);
    }
  }

  if (!snapshot) {
    return <main style={{ padding: '2rem' }}>Loading room {code}…</main>;
  }

  if (phase === 'lobby') {
    return (
      <Lobby
        code={code}
        seats={snapshot.seats}
        viewerSeat={viewerSeat}
        isHost={snapshot.isHost}
        starting={starting}
        onStart={startRoom}
        joining={joining}
        onJoin={joinRoom}
      />
    );
  }

  // A hand is running but this visitor isn't seated (no redacted state for them).
  if (!state || viewerSeat === null) {
    return (
      <main style={{ padding: '2rem', maxWidth: 600, margin: '0 auto' }}>
        <h1>Room {code}</h1>
        <p>A hand is already in progress and there's no free seat. Hang tight for the next one.</p>
      </main>
    );
  }

  const myHand = state.hands[viewerSeat];
  const ownTiles = myHand.own ? myHand.concealed : [];
  const legalDiscards = new Set(
    legal.filter((i) => i.t === 'discard').map((i) => tileKey((i as Extract<Intent, { t: 'discard' }>).tile)),
  );

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
          const info = snapshot.seats[seat];
          const active = state.phase.t === 'awaitDiscard' && state.phase.seat === seat;
          return (
            <SeatView
              key={seat}
              seat={seat}
              name={seat === viewerSeat ? 'You' : (info?.name ?? `Seat ${seat}`)}
              concealedCount={h.own ? h.concealed.length : h.concealedCount}
              exposed={h.exposed}
              flowers={h.flowers}
              active={active}
            />
          );
        })}
      </section>
      <Discards discards={state.discards} />
      <Hand tiles={ownTiles} legalDiscards={legalDiscards} onDiscard={(t) => send({ t: 'discard', seat: viewerSeat, tile: t })} />
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
