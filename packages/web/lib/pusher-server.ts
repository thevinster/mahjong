import Pusher from 'pusher';
import { env } from './env.js';
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
  await getPusher().trigger(roomChannel(code), 's:event', { event, seq });
}

/**
 * Sign a Pusher private-channel subscription request. Called from /api/pusher/auth.
 */
export function authenticateChannel(socketId: string, channel: string, userId: string): string {
  return getPusher().authorizeChannel(socketId, channel, {
    user_id: userId,
  }).auth;
}
