import { buildBotView, legalIntents, seededRng, heuristicPolicy, type Seat, type BotPolicy, type GameState } from '@mahjong/engine';
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

/** Does this seat have a real (non-pass) option right now? */
function seatHasChoice(state: GameState, seat: Seat): boolean {
  return legalIntents(state, seat).some((i) => i.t !== 'pass');
}
function seatCanPass(state: GameState, seat: Seat): boolean {
  return legalIntents(state, seat).some((i) => i.t === 'pass');
}

/**
 * Advance the game without human input wherever no real decision is required:
 *   - bot seats play their policy move;
 *   - human seats in awaitClaims with NO claim available are auto-passed
 *     (their only legal move is pass, so clicking it adds nothing).
 * Stops as soon as a human must actually choose (discard, or a real claim) or
 * the hand ends. Runs synchronously within the request — no setTimeout.
 *
 * MAX_TURNS is a high backstop so an all-bot hand (e.g. after a disconnect)
 * can finish in a single call; a normal hand stops at the human far sooner.
 */
export function runBotTurnsInline(room: Room, MAX_TURNS = 400): import('@mahjong/engine').Event[] {
  const events: import('@mahjong/engine').Event[] = [];
  for (let i = 0; i < MAX_TURNS; i++) {
    const seat = nextActor(room);
    if (seat === null) return events;
    const state = room.state!;
    const binding = room.seats[seat];

    if (binding.kind === 'bot') {
      const policy = POLICIES[binding.policyName] ?? heuristicPolicy;
      const view = buildBotView(state, seat, seededRng(room.seq + seat + 1));
      const intent = policy.decide(view);
      const result = applyIntent(room, seat, intent);
      if (!result.ok) return events;
      events.push(...result.events);
      continue;
    }

    // Human: only auto-act for a no-choice claim (pass is their sole legal move).
    if (state.phase.t === 'awaitClaims' && !seatHasChoice(state, seat) && seatCanPass(state, seat)) {
      const result = applyIntent(room, seat, { t: 'pass', seat });
      if (!result.ok) return events;
      events.push(...result.events);
      continue;
    }

    return events; // a human must make a real decision
  }
  return events;
}

export function botPolicyByName(name: string): BotPolicy {
  return POLICIES[name] ?? heuristicPolicy;
}
