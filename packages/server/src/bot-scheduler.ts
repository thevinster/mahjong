import type { Server as IOServer } from 'socket.io';
import { buildBotView, seededRng, type Seat } from '@mahjong/engine';
import type { Room } from './rooms.js';
import { applyIntent } from './dispatcher.js';
import { broadcastEvent } from './redact.js';

const SEATS: readonly Seat[] = [0, 1, 2, 3];

/** Returns the seat that owes the next action, or null if no seat does. */
export function nextActor(room: Room): Seat | null {
  const s = room.state;
  if (!s || s.phase.t === 'ended') return null;
  if (s.phase.t === 'awaitDiscard') return s.phase.seat;
  // awaitClaims: the first pending seat that hasn't yet responded
  for (const seat of s.phase.pendingFrom) {
    if (!room.pendingClaims.has(seat)) return seat;
  }
  return null;
}

/** Sleep helper (no-op when in fakeTimers; real ms otherwise). */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS ?? 400);

/**
 * If the next actor is a bot, fetch its intent and apply. Loop while bots
 * continue to own consecutive decisions. Yields jittered delays (400–900ms)
 * between bot actions so play doesn't feel uncannily instant.
 */
export async function maybeRunBotTurns(io: IOServer, room: Room): Promise<void> {
  let iterations = 0;
  while (true) {
    iterations++;
    if (iterations > 500) {
      console.error('[bot-scheduler] Too many iterations, possible infinite loop');
      return;
    }
    const seat = nextActor(room);
    if (seat === null) return;
    const b = room.seats[seat];
    if (b.kind !== 'bot') return;
    const policy = room.policies[seat];
    if (!policy) return;
    await sleep(BOT_DELAY_MS + Math.floor(Math.random() * BOT_DELAY_MS));
    const view = buildBotView(room.state!, seat, seededRng(room.seq + seat + 1));
    const intent = policy.decide(view);
    const result = applyIntent(room, seat, intent);
    if (!result.ok) return; // shouldn't happen; bots can only emit legal intents
    for (const ev of result.events) broadcastEvent(io, room, ev);
  }
}
