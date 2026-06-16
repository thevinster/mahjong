'use client';
import { useEffect } from 'react';
import { getPusherClient } from '@/lib/pusher-client';
import { useGame } from './useGame';
import type { Seat, Event, RedactedGameState } from '@mahjong/engine';

/**
 * Subscribes to the room's public channel + this seat's private channel.
 * On every s:event, calls store.applyEvent. Fetches an initial snapshot on mount.
 */
export function usePusherRoom(roomCode: string, mySeat: Seat) {
  const { setSnapshot, applyEvent } = useGame();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await fetch(`/api/rooms/${roomCode}/snapshot`);
      if (!r.ok) return;
      const snap: RedactedGameState = await r.json();
      if (cancelled) return;
      setSnapshot(snap);
    })();

    const pusher = getPusherClient();
    const roomChan = pusher.subscribe(`private-room-${roomCode}`);
    const seatChan = pusher.subscribe(`private-room-${roomCode}-seat-${mySeat}`);
    const onEvent = (msg: { event: Event; seq: number }) => applyEvent(msg.event, msg.seq);
    roomChan.bind('s:event', onEvent);
    seatChan.bind('s:event', onEvent);

    return () => {
      cancelled = true;
      roomChan.unbind('s:event', onEvent);
      seatChan.unbind('s:event', onEvent);
      pusher.unsubscribe(`private-room-${roomCode}`);
      pusher.unsubscribe(`private-room-${roomCode}-seat-${mySeat}`);
    };
  }, [roomCode, mySeat, setSnapshot, applyEvent]);
}
