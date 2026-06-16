import './kv-mock.js';
import { describe, it, expect } from 'vitest';
import { initialState, seededRng } from '@mahjong/engine';
import { applyIntent } from '../lib/dispatcher';
import type { Room } from '../lib/rooms';

function fakeRoom(): Room {
  return {
    code: 'TEST', createdAt: 0, host: 'h',
    seats: {
      0: { kind: 'human', playerId: 'h', displayName: 'h', connected: true },
      1: { kind: 'bot', policyName: 'heuristic-v1' },
      2: { kind: 'bot', policyName: 'heuristic-v1' },
      3: { kind: 'bot', policyName: 'heuristic-v1' },
    },
    state: initialState(seededRng(1)),
    phase: 'playing', endedAt: null, seq: 0,
    pendingClaims: {},
    version: 1,
  };
}

describe('dispatcher (port)', () => {
  it('rejects illegal intent without mutating state', () => {
    const room = fakeRoom();
    const beforePhase = room.state!.phase.t;
    const r = applyIntent(room, 1, { t: 'discard', seat: 1, tile: room.state!.hands[0]!.concealed[0]! });
    expect(r.ok).toBe(false);
    expect(room.state!.phase.t).toBe(beforePhase);
  });

  it('accepts legal discard, advances to awaitClaims', () => {
    const room = fakeRoom();
    const tile = room.state!.hands[0]!.concealed[0]!;
    const r = applyIntent(room, 0, { t: 'discard', seat: 0, tile });
    expect(r.ok).toBe(true);
    expect(room.state!.phase.t).toBe('awaitClaims');
  });
});
