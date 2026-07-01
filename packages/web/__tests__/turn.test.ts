import { describe, it, expect } from 'vitest';
import { initialState, seededRng, heuristicPolicy, type GameState, type Seat } from '@mahjong/engine';
import type { Room, SeatBinding } from '../lib/rooms';
import { reconcileTurnTimeout, armTurnDeadline, TURN_LIMIT_MS } from '../lib/bot-scheduler';

const bot: SeatBinding = { kind: 'bot', policyName: heuristicPolicy.name };
const human = (id: string): SeatBinding => ({ kind: 'human', playerId: id, displayName: id, connected: true });

function room(state: GameState | null, over: Partial<Room> = {}): Room {
  return {
    code: 'T', createdAt: 0, host: 'h',
    seats: { 0: human('h'), 1: bot, 2: bot, 3: bot },
    state, phase: 'playing', endedAt: null, seq: 0, pendingClaims: {}, version: 1,
    turnDeadline: null,
    ...over,
  } as Room;
}

describe('reconcileTurnTimeout — convert a dropped (timed-out) player to a bot', () => {
  it('flips the seat on turn to a bot once the deadline has passed', () => {
    const r = room(initialState(seededRng(1)), { turnDeadline: 1 }); // deadline far in the past
    expect(reconcileTurnTimeout(r)).toBe(true);
    expect(r.seats[0].kind).toBe('bot');
  });

  it('does nothing while the deadline is still in the future', () => {
    const r = room(initialState(seededRng(1)), { turnDeadline: Date.now() + TURN_LIMIT_MS });
    expect(reconcileTurnTimeout(r)).toBe(false);
    expect(r.seats[0].kind).toBe('human');
  });

  it('does nothing when no deadline is set', () => {
    const r = room(initialState(seededRng(1)), { turnDeadline: null });
    expect(reconcileTurnTimeout(r)).toBe(false);
    expect(r.seats[0].kind).toBe('human');
  });

  it('does not flip when the seat on turn is already a bot', () => {
    const r = room(initialState(seededRng(1)), { turnDeadline: 1, seats: { 0: bot, 1: bot, 2: bot, 3: bot } });
    expect(reconcileTurnTimeout(r)).toBe(false);
  });
});

describe('armTurnDeadline', () => {
  it('sets a future deadline for an ongoing hand', () => {
    const r = room(initialState(seededRng(1)), { turnDeadline: null });
    armTurnDeadline(r);
    expect(r.turnDeadline).not.toBeNull();
    expect(r.turnDeadline! > Date.now()).toBe(true);
  });

  it('clears the deadline once the hand has ended', () => {
    const ended = { ...initialState(seededRng(1)), phase: { t: 'ended', winner: 0, score: { 0: 0, 1: 0, 2: 0, 3: 0 } } } as GameState;
    const r = room(ended, { turnDeadline: 123 });
    armTurnDeadline(r);
    expect(r.turnDeadline).toBeNull();
  });
});
