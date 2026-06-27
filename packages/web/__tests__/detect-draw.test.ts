import { describe, it, expect } from 'vitest';
import { detectDraw } from '../lib/detect-draw';
import type { RoomSnapshot } from '../lib/protocol';
import type { Seat, Tile } from '@mahjong/engine';

const p = (rank: number): Tile => ({ kind: 'suit', suit: 'p', rank } as Tile);

function snap(opts: {
  concealed?: Tile[];
  seq?: number;
  viewerSeat?: Seat | null;
  own?: boolean;
  noState?: boolean;
}): RoomSnapshot {
  const { concealed = [], seq = 1, viewerSeat = 0, own = true, noState = false } = opts;
  const other = () => ({ own: false, concealedCount: 0, exposed: [], flowers: [] });
  const ownHand = own
    ? { own: true, concealed, exposed: [], flowers: [] }
    : { own: false, concealedCount: concealed.length, exposed: [], flowers: [] };
  const hands: Record<number, unknown> = { 0: other(), 1: other(), 2: other(), 3: other() };
  if (viewerSeat !== null) hands[viewerSeat] = ownHand;
  const state = noState ? null : { hands };
  return {
    code: 'T', phase: noState ? 'lobby' : 'playing', viewerSeat,
    isHost: true, seq, seats: [], state,
  } as unknown as RoomSnapshot;
}

describe('detectDraw — which concealed tile is newly drawn', () => {
  it('returns the tile that appeared when the hand grows by exactly one', () => {
    const prev = snap({ concealed: [p(1), p(2), p(3)] });
    const next = snap({ concealed: [p(1), p(2), p(3), p(5)] });
    expect(detectDraw(prev, next)).toBe('p5');
  });

  it('detects a drawn duplicate of a tile already in hand', () => {
    const prev = snap({ concealed: [p(5)] });
    const next = snap({ concealed: [p(5), p(5)] });
    expect(detectDraw(prev, next)).toBe('p5');
  });

  it('returns null when the hand is unchanged (a poll with no draw)', () => {
    const prev = snap({ concealed: [p(1), p(2)] });
    const next = snap({ concealed: [p(1), p(2)] });
    expect(detectDraw(prev, next)).toBeNull();
  });

  it('returns null on a discard (the hand shrinks)', () => {
    const prev = snap({ concealed: [p(1), p(2), p(3)] });
    const next = snap({ concealed: [p(1), p(2)] });
    expect(detectDraw(prev, next)).toBeNull();
  });

  it('returns null on initial load (no previous snapshot)', () => {
    const next = snap({ concealed: [p(1), p(2)] });
    expect(detectDraw(null, next)).toBeNull();
  });

  it('returns null when the hand jumps by more than one (ambiguous / missed state)', () => {
    const prev = snap({ concealed: [p(1)] });
    const next = snap({ concealed: [p(1), p(2), p(3)] });
    expect(detectDraw(prev, next)).toBeNull();
  });

  it('returns null for a spectator who cannot see concealed tiles', () => {
    const prev = snap({ concealed: [p(1)], own: false });
    const next = snap({ concealed: [p(1), p(2)], own: false });
    expect(detectDraw(prev, next)).toBeNull();
  });

  it('returns null when the viewer changed seats (no comparable prior hand)', () => {
    const prev = snap({ concealed: [p(1)], viewerSeat: 1 });
    const next = snap({ concealed: [p(1), p(2)], viewerSeat: 0 });
    expect(detectDraw(prev, next)).toBeNull();
  });
});
