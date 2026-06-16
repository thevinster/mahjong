import type { Room, SeatBinding } from './rooms.js';
import { heuristicPolicy, type Seat } from '@mahjong/engine';

export const GRACE_MS = 60_000;
const SEATS: readonly Seat[] = [0, 1, 2, 3];

/**
 * For every disconnected human whose grace has expired, flip them to a bot.
 * Mutates `room` in place. Returns true if any seat was flipped (caller
 * should consider triggering a bot turn loop afterward).
 */
export function reconcileGrace(room: Room): boolean {
  const now = Date.now();
  let flipped = false;
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind !== 'human' || b.connected) continue;
    if (!b.graceExpiresAt || now < b.graceExpiresAt) continue;
    room.seats[seat] = { kind: 'bot', policyName: heuristicPolicy.name };
    flipped = true;
  }
  return flipped;
}

export function markDisconnected(room: Room, playerId: string): void {
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind !== 'human' || b.playerId !== playerId) continue;
    b.connected = false;
    b.graceExpiresAt = Date.now() + GRACE_MS;
  }
}

export function markReconnected(room: Room, playerId: string): void {
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind !== 'human' || b.playerId !== playerId) continue;
    b.connected = true;
    delete (b as SeatBinding & { graceExpiresAt?: number }).graceExpiresAt;
  }
}
