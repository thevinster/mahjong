import type { GameState, Seat } from '../game.js';
import { redactFor } from '../game.js';
import { legalIntents } from '../rules.js';
import type { BotView, OpponentView } from './policy.js';
import type { Rng } from '../rng.js';

export function buildBotView(state: GameState, seat: Seat, rng: Rng): BotView {
  const redacted = redactFor(state, seat);
  const opponents: Record<Seat, OpponentView> = { 0: empty(), 1: empty(), 2: empty(), 3: empty() };
  for (const s of [0, 1, 2, 3] as Seat[]) {
    if (s === seat) continue;
    const rh = redacted.hands[s];
    if (rh.own) throw new Error('redaction bug: own=true for opponent seat');
    opponents[s] = { concealedCount: rh.concealedCount, exposed: rh.exposed, flowers: rh.flowers };
  }
  return {
    seat,
    myHand: state.hands[seat],
    opponents,
    discards: state.discards,
    wallRemaining: state.wall.length,
    phase: state.phase,
    legalIntents: legalIntents(state, seat),
    rng,
  };
}

function empty(): OpponentView {
  return { concealedCount: 0, exposed: [], flowers: [] };
}
