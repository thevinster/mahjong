'use client';
import { useEffect } from 'react';
import { getPusherClient } from '@/lib/pusher-client';
import { createRoomSync, type RoomSubscription } from '@/lib/room-sync';
import { useGame } from './useGame';
import type { Seat, Event } from '@mahjong/engine';
import type { RoomSnapshot } from '@/lib/protocol';

/**
 * Keeps the store in sync with the server. The server is the single source of
 * truth, so on every realtime push we refetch the per-seat redacted snapshot
 * (client-side reduction is impossible on redacted state). `s:event` also feeds
 * the action log.
 *
 * Realtime (Pusher) is the fast path; it is best-effort. A short polling loop
 * (see createRoomSync) is the safety net, so EVERY client — not just the one
 * taking an action — converges within a few seconds without a manual refresh,
 * even if Pusher fails to connect or drops a message.
 *
 * Subscribes to the public room channel always; the seat-private channel only
 * once the viewer's seat is known (the auth route 403s non-owners).
 */
export function usePusherRoom(roomCode: string, viewerSeat: Seat | null) {
  const setSnapshot = useGame((s) => s.setSnapshot);
  const applyEvent = useGame((s) => s.applyEvent);

  useEffect(() => {
    if (!roomCode) return;
    let cancelled = false;

    async function refetch() {
      const r = await fetch(`/api/rooms/${roomCode}/snapshot`);
      if (!r.ok || cancelled) return;
      const snap: RoomSnapshot = await r.json();
      if (!cancelled) setSnapshot(snap);
    }

    // Wire the Pusher fast path. May throw (missing NEXT_PUBLIC_* / blocked
    // socket) — createRoomSync catches that and keeps polling.
    function subscribe(): RoomSubscription {
      const pusher = getPusherClient();
      const onEvent = (msg: { event: Event; seq: number }) => {
        applyEvent(msg.event, msg.seq);
        void refetch();
      };
      const onLobby = () => { void refetch(); };

      const roomName = `private-room-${roomCode}`;
      const roomChan = pusher.subscribe(roomName);
      roomChan.bind('s:event', onEvent);
      roomChan.bind('s:lobby', onLobby);

      const seatName = viewerSeat !== null ? `private-room-${roomCode}-seat-${viewerSeat}` : null;
      const seatChan = seatName ? pusher.subscribe(seatName) : null;
      seatChan?.bind('s:event', onEvent);

      return {
        unsubscribe() {
          roomChan.unbind('s:event', onEvent);
          roomChan.unbind('s:lobby', onLobby);
          pusher.unsubscribe(roomName);
          if (seatName) {
            seatChan?.unbind('s:event', onEvent);
            pusher.unsubscribe(seatName);
          }
        },
      };
    }

    const sync = createRoomSync({ refetch: () => { void refetch(); }, subscribe });
    sync.start();

    return () => {
      cancelled = true;
      sync.stop();
    };
  }, [roomCode, viewerSeat, setSnapshot, applyEvent]);
}
