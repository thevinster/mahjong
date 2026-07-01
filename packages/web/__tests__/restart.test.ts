import { describe, it, expect } from 'vitest';
import { canStartHand, type Room } from '../lib/rooms';
import { initialState, seededRng, type GameState } from '@mahjong/engine';

function room(over: Partial<Room>): Room {
  return {
    code: 'T', createdAt: 0, host: 'h',
    seats: { 0: { kind: 'empty' }, 1: { kind: 'empty' }, 2: { kind: 'empty' }, 3: { kind: 'empty' } },
    state: null, phase: 'lobby', endedAt: null, seq: 0, pendingClaims: {}, version: 1, turnDeadline: null,
    ...over,
  } as Room;
}

describe('canStartHand — host may (re)start a hand', () => {
  it('allows starting from the lobby', () => {
    expect(canStartHand(room({ phase: 'lobby', state: null }))).toBe(true);
  });

  it('allows starting a NEW hand once the previous one has ended', () => {
    const ended = { ...initialState(seededRng(1)), phase: { t: 'ended', winner: 0, score: { 0: 0, 1: 0, 2: 0, 3: 0 } } } as GameState;
    expect(canStartHand(room({ phase: 'playing', state: ended }))).toBe(true);
  });

  it('refuses to start while a hand is still in progress', () => {
    expect(canStartHand(room({ phase: 'playing', state: initialState(seededRng(1)) }))).toBe(false);
  });
});
