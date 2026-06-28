import { describe, it, expect, beforeEach } from 'vitest';
import { useGame } from '../hooks/useGame';
import type { RoomSnapshot } from '../lib/protocol';
import type { Event, Tile } from '@mahjong/engine';

function snap(seq: number): RoomSnapshot {
  return { code: 'TEST', phase: 'playing', viewerSeat: 0, isHost: true, seq, seats: [], state: null };
}

const p = (rank: number): Tile => ({ kind: 'suit', suit: 'p', rank } as Tile);

function snapHand(concealed: Tile[], seq: number): RoomSnapshot {
  const other = () => ({ own: false, concealedCount: 0, exposed: [], flowers: [] });
  const hands: Record<number, unknown> = {
    0: { own: true, concealed, exposed: [], flowers: [] },
    1: other(), 2: other(), 3: other(),
  };
  return {
    code: 'T', phase: 'playing', viewerSeat: 0, isHost: true, seq, seats: [],
    state: { hands },
  } as unknown as RoomSnapshot;
}

describe('useGame store', () => {
  beforeEach(() => useGame.getState().reset());

  it('keeps the newest snapshot and ignores stale (lower-seq) ones', () => {
    const g = () => useGame.getState();
    g().setSnapshot(snap(5));
    expect(g().snapshot!.seq).toBe(5);
    g().setSnapshot(snap(3)); // stale arrival
    expect(g().snapshot!.seq).toBe(5);
    g().setSnapshot(snap(7)); // newer
    expect(g().snapshot!.seq).toBe(7);
  });

  it('does not let a stale lobby snapshot clobber the live game at equal seq', () => {
    const g = () => useGame.getState();
    g().setSnapshot({ ...snap(0), phase: 'playing' });
    g().setSnapshot({ ...snap(0), phase: 'lobby' }); // stale refetch resolves late
    expect(g().snapshot!.phase).toBe('playing');
  });

  it('still transitions lobby → playing at equal seq', () => {
    const g = () => useGame.getState();
    g().setSnapshot({ ...snap(0), phase: 'lobby' });
    g().setSnapshot({ ...snap(0), phase: 'playing' });
    expect(g().snapshot!.phase).toBe('playing');
  });

  it('appends events to the log and dedups by seq', () => {
    const g = () => useGame.getState();
    const ev = { t: 'discarded', seat: 1, tile: { kind: 'honor', honor: 'E' } } as Event;
    g().applyEvent(ev, 1);
    g().applyEvent(ev, 1); // duplicate seq — ignored
    g().applyEvent(ev, 2);
    expect(g().log).toHaveLength(2);
  });

  it('stores the raw event on each log entry so the UI can render tile faces', () => {
    const g = () => useGame.getState();
    const ev = { t: 'discarded', seat: 1, tile: { kind: 'suit', suit: 'p', rank: 5 } } as Event;
    g().applyEvent(ev, 1);
    expect(g().log[0]!.ev).toEqual(ev);
  });

  it('highlights the newly drawn tile when the viewer\'s hand grows (snapshot-driven)', () => {
    const g = () => useGame.getState();
    g().setSnapshot(snapHand([p(1), p(2)], 1));
    expect(g().recentDrawId).toBeNull(); // first load: nothing is "new" yet
    g().setSnapshot(snapHand([p(1), p(2), p(5)], 2));
    expect(g().recentDrawId).toBe('p5');
    g().clearRecentDraw();
    expect(g().recentDrawId).toBeNull();
  });

  it('does not re-flag a draw when a poll returns the same hand', () => {
    const g = () => useGame.getState();
    g().setSnapshot(snapHand([p(1), p(2), p(5)], 1));
    g().setSnapshot(snapHand([p(1), p(2), p(5)], 2)); // identical hand, newer seq
    expect(g().recentDrawId).toBeNull();
  });

  it('appends a drew event to the log but does not drive the highlight (now snapshot-driven)', () => {
    const g = () => useGame.getState();
    g().applyEvent({ t: 'drew', seat: 0, tileForSeat: { kind: 'suit', suit: 'p', rank: 5 } } as Event, 3);
    expect(g().log).toHaveLength(1);
    expect(g().recentDrawId).toBeNull();
  });
});
