import type { Server as IOServer } from 'socket.io';
import type { Event, GameState, Seat } from '@mahjong/engine';
import { redactFor } from '@mahjong/engine';
import type { Room } from './rooms.js';

const SEATS: readonly Seat[] = [0, 1, 2, 3];

/**
 * Broadcast a state-change event to every connected human in the room,
 * redacted per recipient. Bots don't receive events.
 *
 * Caller pre-increments `room.seq` and passes the new value.
 */
export function broadcastEvent(io: IOServer, room: Room, event: Event) {
  room.seq++;
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind !== 'human' || !b.connected) continue;
    const redacted = redactSingleEvent(event, seat);
    io.of('/game').to(playerRoom(b.playerId)).emit('s:event', { event: redacted, seq: room.seq });
  }
}

/**
 * Send a fresh snapshot to a specific player.
 */
export function sendSnapshot(io: IOServer, room: Room, playerId: string, viewerSeat: Seat) {
  if (!room.state) return;
  const snapshot = redactFor(room.state, viewerSeat);
  io.of('/game').to(playerRoom(playerId)).emit('s:snapshot', { state: snapshot });
}

/**
 * Per-recipient redaction of the only event type that carries private info:
 * `drew` with tileForSeat. All other events are public.
 */
function redactSingleEvent(event: Event, viewer: Seat): Event {
  if (event.t === 'drew' && event.seat !== viewer && 'tileForSeat' in event) {
    return { t: 'drew', seat: event.seat };
  }
  return event;
}

export function playerRoom(playerId: string): string {
  return `player:${playerId}`;
}

export function gameRoom(code: string): string {
  return `room:${code}`;
}
