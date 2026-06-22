import Pusher from 'pusher';
import { env } from './env';
import type { Event, Seat } from '@mahjong/engine';

let _pusher: Pusher | null = null;
function getPusher(): Pusher {
  if (_pusher) return _pusher;
  _pusher = new Pusher({
    appId:   env.pusher.appId(),
    key:     env.pusher.key(),
    secret:  env.pusher.secret(),
    cluster: env.pusher.cluster(),
    useTLS:  true,
  });
  return _pusher;
}

export function roomChannel(code: string): string {
  return `private-room-${code}`;
}
export function seatChannel(code: string, seat: Seat): string {
  return `private-room-${code}-seat-${seat}`;
}

/**
 * Broadcast an event to a room. If the event carries seat-private info
 * (drew with tileForSeat), publishes a redacted copy to the public channel
 * AND the private tile to the recipient seat's channel.
 */
export async function broadcastEvent(code: string, event: Event, seq: number): Promise<void> {
  if (event.t === 'drew' && 'tileForSeat' in event && event.tileForSeat) {
    // Send the private tile to the recipient seat only
    await getPusher().trigger(seatChannel(code, event.seat), 's:event', {
      event, seq,
    });
    // And a redacted version to everyone (just the count change)
    await getPusher().trigger(roomChannel(code), 's:event', {
      event: { t: 'drew', seat: event.seat },
      seq,
    });
    return;
  }
  if (event.t === 'flowerReplaced' && event.replacement) {
    // The replacement tile is a private draw — send the full event to the owner,
    // and a stripped version (flower only) to everyone else.
    await getPusher().trigger(seatChannel(code, event.seat), 's:event', { event, seq });
    await getPusher().trigger(roomChannel(code), 's:event', {
      event: { t: 'flowerReplaced', seat: event.seat, flower: event.flower },
      seq,
    });
    return;
  }
  await getPusher().trigger(roomChannel(code), 's:event', { event, seq });
}

/**
 * Broadcast a "room changed, refetch your snapshot" ping on the public room
 * channel. Used for lobby changes (join/leave) and for hand start — the latter
 * may produce zero game events (the human dealer acts first), so without this
 * other lobby clients would never learn the hand began.
 */
export async function broadcastLobby(code: string, seq: number): Promise<void> {
  await getPusher().trigger(roomChannel(code), 's:lobby', { seq });
}

/**
 * Sign a Pusher private-channel subscription request. Called from /api/pusher/auth.
 */
export function authenticateChannel(socketId: string, channel: string, userId: string): string {
  return getPusher().authorizeChannel(socketId, channel, {
    user_id: userId,
  }).auth;
}
