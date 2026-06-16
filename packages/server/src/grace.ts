import type { Server as IOServer } from 'socket.io';
import type { Room, SeatBinding } from './rooms.js';
import { heuristicPolicy, type Seat } from '@mahjong/engine';
import { maybeRunBotTurns } from './bot-scheduler.js';

export const GRACE_MS = 60_000;
const SEATS: readonly Seat[] = [0, 1, 2, 3];

/** Mark the human as disconnected; arm a grace timer that flips them to bot if not back in 60s. */
export function onPlayerDisconnect(io: IOServer, room: Room, playerId: string): void {
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind !== 'human' || b.playerId !== playerId) continue;
    b.connected = false;
    if (room.graceTimers[seat]) clearTimeout(room.graceTimers[seat]!);
    room.graceTimers[seat] = setTimeout(() => {
      room.graceTimers[seat] = null;
      const cur: SeatBinding = room.seats[seat];
      if (cur.kind !== 'human' || cur.connected) return;
      room.seats[seat] = { kind: 'bot', policyName: heuristicPolicy.name };
      room.policies[seat] = heuristicPolicy;
      // CRITICAL: Wrap maybeRunBotTurns in room.lock.enqueue to avoid racing with concurrent c:intent handlers
      room.lock.enqueue(async () => {
        await maybeRunBotTurns(io, room);
      });
    }, GRACE_MS);
  }
}

/** Cancel the grace timer for the seat the player is in. */
export function onPlayerReconnect(room: Room, playerId: string): void {
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind !== 'human' || b.playerId !== playerId) continue;
    b.connected = true;
    if (room.graceTimers[seat]) {
      clearTimeout(room.graceTimers[seat]!);
      room.graceTimers[seat] = null;
    }
  }
}
