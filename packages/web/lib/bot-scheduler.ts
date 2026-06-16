import { buildBotView, seededRng, heuristicPolicy, type Seat, type BotPolicy } from '@mahjong/engine';
import type { Room } from './rooms';
import { applyIntent } from './dispatcher';

const SEATS: readonly Seat[] = [0, 1, 2, 3];
const POLICIES: Record<string, BotPolicy> = {
  [heuristicPolicy.name]: heuristicPolicy,
};

function nextActor(room: Room): Seat | null {
  const s = room.state;
  if (!s || s.phase.t === 'ended') return null;
  if (s.phase.t === 'awaitDiscard') return s.phase.seat;
  for (const seat of s.phase.pendingFrom) {
    if (!(String(seat) in room.pendingClaims)) return seat;
  }
  return null;
}

/**
 * Loop while the next actor is a bot. Returns the combined event stream.
 * NO setTimeout — this runs synchronously within the single intent request
 * so all consecutive bot turns are processed before the API response returns.
 *
 * Cap at MAX_TURNS to defend against pathological loops; should never fire
 * in normal play.
 */
export function runBotTurnsInline(room: Room, MAX_TURNS = 50): import('@mahjong/engine').Event[] {
  const events: import('@mahjong/engine').Event[] = [];
  for (let i = 0; i < MAX_TURNS; i++) {
    const seat = nextActor(room);
    if (seat === null) return events;
    const b = room.seats[seat];
    if (b.kind !== 'bot') return events;
    const policy = POLICIES[b.policyName] ?? heuristicPolicy;
    const view = buildBotView(room.state!, seat, seededRng(room.seq + seat + 1));
    const intent = policy.decide(view);
    const result = applyIntent(room, seat, intent);
    if (!result.ok) return events;
    events.push(...result.events);
  }
  return events;
}

export function botPolicyByName(name: string): BotPolicy {
  return POLICIES[name] ?? heuristicPolicy;
}
