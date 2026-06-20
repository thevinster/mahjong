import { redactFor, type Seat } from '@mahjong/engine';
import type { Room } from './rooms';
import type { RoomSnapshot, SeatPublic } from './protocol';

const SEATS: readonly Seat[] = [0, 1, 2, 3];

/**
 * Build the client-facing snapshot for one viewer. Serves both the lobby
 * (state === null) and an in-progress hand. The seat roster is public (no
 * playerIds); the redacted game `state` is attached only when a hand is
 * running and the viewer occupies a seat (redaction requires a seat).
 */
export function buildRoomSnapshot(room: Room, playerId: string): RoomSnapshot {
  let viewerSeat: Seat | null = null;
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind === 'human' && b.playerId === playerId) { viewerSeat = seat; break; }
  }

  const seats: SeatPublic[] = SEATS.map((seat) => {
    const b = room.seats[seat];
    if (b.kind === 'human') return { seat, kind: 'human', name: b.displayName, connected: b.connected };
    if (b.kind === 'bot')   return { seat, kind: 'bot',   name: 'Bot', connected: false };
    return { seat, kind: 'empty', name: null, connected: false };
  });

  const phase: RoomSnapshot['phase'] =
    !room.state ? 'lobby' : room.state.phase.t === 'ended' ? 'ended' : 'playing';

  const state = room.state && viewerSeat !== null ? redactFor(room.state, viewerSeat) : null;

  return {
    code: room.code,
    phase,
    viewerSeat,
    isHost: room.host === playerId,
    seq: room.seq,
    seats,
    state,
  };
}
