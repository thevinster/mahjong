'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Hand } from '@/components/Hand';
import { SeatView } from '@/components/Seat';
import { Discards } from '@/components/Discards';
import { ActionBar } from '@/components/ActionBar';
import { ActionLog } from '@/components/ActionLog';
import { EndPanel } from '@/components/EndPanel';
import { Lobby } from '@/components/Lobby';
import { useGame } from '@/hooks/useGame';
import { usePusherRoom } from '@/hooks/usePusherRoom';
import { viewerLegalIntents } from '@/lib/client-legal';
import { arrangeHand } from '@/lib/arrange-hand';
import { theme } from '@/lib/theme';
import { tileId } from '@mahjong/engine';
import type { Intent, Seat } from '@mahjong/engine';

const TICK_MS = 8000;

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = params?.code ?? '';

  const snapshot = useGame((s) => s.snapshot);
  const setSnapshot = useGame((s) => s.setSnapshot);
  const recentDrawId = useGame((s) => s.recentDrawId);
  const clearRecentDraw = useGame((s) => s.clearRecentDraw);

  const viewerSeat = snapshot?.viewerSeat ?? null;
  const state = snapshot?.state ?? null;
  const phase = snapshot?.phase ?? null;

  const [legal, setLegal] = useState<Intent[]>([]);
  const [starting, setStarting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [manualOrder, setManualOrder] = useState<string[] | null>(null);

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
    return <CenteredFelt>Loading room {code}…</CenteredFelt>;
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
      <CenteredFelt>
        <h2 style={{ margin: '0 0 8px' }}>Room {code}</h2>
        <p style={{ color: theme.inkDim }}>A hand is already in progress and there&apos;s no free seat. Hang tight for the next one.</p>
      </CenteredFelt>
    );
  }

  const myHand = state.hands[viewerSeat];
  const concealed = myHand.own ? myHand.concealed : [];
  // Auto-sorted by default; honours the player's manual arrangement when set, and
  // holds the just-drawn tile apart at the end until the player clicks Sort.
  const arranged = arrangeHand(concealed, manualOrder, recentDrawId);
  const legalDiscards = new Set(
    legal.filter((i) => i.t === 'discard').map((i) => tileId((i as Extract<Intent, { t: 'discard' }>).tile)),
  );

  // Seats placed around the table relative to the viewer (you at the bottom).
  const rightSeat = ((viewerSeat + 1) & 3) as Seat;
  const topSeat = ((viewerSeat + 2) & 3) as Seat;
  const leftSeat = ((viewerSeat + 3) & 3) as Seat;
  const nameOf = (s: Seat) => (s === viewerSeat ? 'You' : (snapshot.seats[s]?.name ?? `Seat ${s}`));

  const seatBlock = (seat: Seat, orientation: 'self' | 'top' | 'left' | 'right') => {
    const h = state.hands[seat];
    const active = state.phase.t === 'awaitDiscard' && state.phase.seat === seat;
    return (
      <SeatView
        seat={seat}
        orientation={orientation}
        name={nameOf(seat)}
        concealedCount={h.own ? h.concealed.length : h.concealedCount}
        exposed={h.exposed}
        flowers={h.flowers}
        active={active}
      />
    );
  };

  const activeSeat: Seat | null = state.phase.t === 'awaitDiscard' ? state.phase.seat : null;
  const yourTurn = activeSeat === viewerSeat;
  const turnLabel =
    state.phase.t === 'ended' ? 'Hand over'
      : state.phase.t === 'awaitClaims' ? 'Claims open'
        : `▶ ${yourTurn ? 'Your' : `${nameOf(activeSeat ?? viewerSeat)}'s`} turn`;

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: theme.feltBg }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 16px', background: theme.feltEdge, color: theme.ink,
        borderBottom: `1px solid ${theme.panelBorder}`,
      }}>
        <strong style={{ letterSpacing: '0.04em' }}>🀄 Room {code}</strong>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: theme.inkDim }}>Round {WINDS[state.prevailingWind]}</span>
          <span style={{ color: theme.inkDim }}>Wall {state.wallRemaining}</span>
          <span style={{ fontWeight: 700, color: yourTurn ? theme.gold : theme.ink }}>{turnLabel}</span>
        </div>
      </div>

      <div style={{
        flex: 1, width: '100%', maxWidth: 1120, margin: '0 auto', boxSizing: 'border-box',
        padding: '12px 16px', display: 'grid', gap: 10,
        gridTemplateColumns: 'minmax(110px, 1fr) minmax(0, 2.4fr) minmax(110px, 1fr)',
        gridTemplateRows: 'auto minmax(170px, 1fr) auto',
      }}>
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center' }}>
          {seatBlock(topSeat, 'top')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' }}>
          {seatBlock(leftSeat, 'left')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, alignSelf: 'stretch' }}>
          <Discards discards={state.discards} />
          <ActionLog />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' }}>
          {seatBlock(rightSeat, 'right')}
        </div>

        <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {seatBlock(viewerSeat, 'self')}
          <ActionBar legalIntents={legal.filter((i) => i.t !== 'discard')} onIntent={send} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 2px' }}>
            <button
              onClick={() => { setManualOrder(null); clearRecentDraw(); }}
              style={{ padding: '0.3rem 0.9rem', fontSize: 13, borderRadius: 999, border: `1px solid ${theme.panelBorder}`, background: 'rgba(255,255,255,0.92)', color: '#23304a', cursor: 'pointer', fontWeight: 600 }}
            >
              Sort
            </button>
            {recentDrawId && <span style={{ fontSize: 12, color: theme.inkDim }}>drawn tile held apart — Sort to merge in</span>}
            {manualOrder && !recentDrawId && <span style={{ fontSize: 12, color: theme.inkDim }}>custom order</span>}
          </div>
          <Hand
            arranged={arranged}
            legalDiscards={legalDiscards}
            onDiscard={(t) => send({ t: 'discard', seat: viewerSeat, tile: t })}
            onReorder={setManualOrder}
            size={64}
          />
        </div>
      </div>

      {state.phase.t === 'ended' && (
        <EndPanel winner={state.phase.winner} score={state.phase.score} viewerSeat={viewerSeat} />
      )}
    </main>
  );
}

const WINDS: Record<'E' | 'S' | 'W' | 'N', string> = { E: '東', S: '南', W: '西', N: '北' };

function CenteredFelt({ children }: { children: React.ReactNode }) {
  return (
    <main style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: theme.feltBg, padding: '2rem',
    }}>
      <div style={{
        maxWidth: 600, padding: '1.5rem 2rem', borderRadius: 16,
        background: theme.panel, border: `1px solid ${theme.panelBorder}`, color: theme.ink,
      }}>
        {children}
      </div>
    </main>
  );
}
