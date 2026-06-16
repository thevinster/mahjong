import { describe, it, expect } from 'vitest';
import { initialState, seededRng } from '@mahjong/engine';
import { applyIntent } from '../src/dispatcher.js';
import type { Room } from '../src/rooms.js';

function fakeRoom(): Room {
  return {
    code: 'TEST', createdAt: 0, host: 'h',
    seats: {
      0: { kind: 'human', playerId: 'h', displayName: 'h', connected: true },
      1: { kind: 'bot', policyName: 'random' },
      2: { kind: 'bot', policyName: 'random' },
      3: { kind: 'bot', policyName: 'random' },
    },
    state: initialState(seededRng(1)),
    policies: { 0: null, 1: null, 2: null, 3: null },
    graceTimers: { 0: null, 1: null, 2: null, 3: null },
    phase: 'playing', endedAt: null, seq: 0,
    pendingClaims: new Map(),
  };
}

describe('applyIntent', () => {
  it('rejects an illegal intent and does not mutate state', () => {
    const room = fakeRoom();
    const before = room.state!.phase.t;
    const result = applyIntent(room, 1, {
      t: 'discard', seat: 1,
      tile: room.state!.hands[0]!.concealed[0]!,
    });
    expect(result.ok).toBe(false);
    expect(room.state!.phase.t).toBe(before);
  });

  it('accepts a legal discard from the active seat, advances phase, returns events', () => {
    const room = fakeRoom();
    const tile = room.state!.hands[0]!.concealed[0]!;
    const result = applyIntent(room, 0, { t: 'discard', seat: 0, tile });
    expect(result.ok).toBe(true);
    expect(room.state!.phase.t).toBe('awaitClaims');
    if (result.ok) {
      expect(result.events.some((e) => e.t === 'discarded')).toBe(true);
    }
  });
});
