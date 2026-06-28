import { describe, it, expect } from 'vitest';
import { initialState, SEATS, step, type GameState, resolveClaimPriority, type Intent, type Seat } from '../src/game.js';
import { seededRng } from '../src/rng.js';
import { tileId, parseTileId, type Tile } from '../src/tiles.js';

describe('initialState', () => {
  it('deals a full, flower-free concealed hand (16, dealer 17) after flower replacement', () => {
    const s = initialState(seededRng(1));
    for (const seat of SEATS) {
      // The concealed hand is the PLAYABLE hand: exactly 16 (17 for the dealer's
      // extra draw), with dealt flowers moved to the flowers pile AND replaced —
      // otherwise the hand could never make 5 melds + a pair. (Flowers are bonus
      // tiles held in addition, so concealed + flowers can exceed 16.)
      const expected = seat === 0 ? 17 : 16;
      expect(s.hands[seat].concealed.length).toBe(expected);
      expect(s.hands[seat].concealed.every((t) => t.kind !== 'flower')).toBe(true);
    }
  });

  it('no flowers remain in concealed slice', () => {
    const s = initialState(seededRng(2));
    for (const seat of SEATS) {
      expect(s.hands[seat].concealed.every((t) => t.kind !== 'flower')).toBe(true);
    }
  });

  it('starts in awaitDiscard for dealer', () => {
    const s = initialState(seededRng(3));
    expect(s.phase).toEqual({ t: 'awaitDiscard', seat: 0 });
  });

  it('conserves 144 tiles across all locations', () => {
    const s = initialState(seededRng(4));
    let total = s.wall.length + s.deadWall.length;
    for (const seat of SEATS) {
      total += s.hands[seat].concealed.length + s.hands[seat].flowers.length;
    }
    expect(total).toBe(144);
  });
});

describe('step — discard', () => {
  it('discard moves to awaitClaims with pending = other 3 seats', () => {
    const s = initialState(seededRng(11));
    const tile = s.hands[0].concealed[0]!;
    const [next, events] = step(s, { t: 'discard', seat: 0, tile });
    expect(next.phase.t).toBe('awaitClaims');
    if (next.phase.t === 'awaitClaims') {
      expect(next.phase.from).toBe(0);
      expect(new Set(next.phase.pendingFrom)).toEqual(new Set([1, 2, 3]));
      expect(tileId(next.phase.discard)).toBe(tileId(tile));
    }
    expect(events.find((e) => e.t === 'discarded')).toBeTruthy();
    // discard added to river
    expect(next.discards[next.discards.length - 1]?.seat).toBe(0);
  });

  it('discard reduces dealer concealed from 17 to 16', () => {
    const s = initialState(seededRng(12));
    expect(s.hands[0].concealed.length).toBe(17);
    const [next] = step(s, { t: 'discard', seat: 0, tile: s.hands[0].concealed[0]! });
    expect(next.hands[0].concealed.length).toBe(16);
  });
});

describe('step — pass and claim resolution', () => {
  it('after all pass, turn advances to next seat and they draw', () => {
    const s0 = initialState(seededRng(20));
    const initialConcealed = s0.hands[1].concealed.length;
    const discardTile = s0.hands[0].concealed[0]!;
    let [s] = step(s0, { t: 'discard', seat: 0, tile: discardTile });
    [s] = step(s, { t: 'pass', seat: 1 });
    [s] = step(s, { t: 'pass', seat: 2 });
    [s] = step(s, { t: 'pass', seat: 3 });
    expect(s.phase.t).toBe('awaitDiscard');
    if (s.phase.t === 'awaitDiscard') {
      expect(s.phase.seat).toBe(1);
    }
    // seat 1 now has one more concealed tile than they started with (drew one)
    expect(s.hands[1].concealed.length).toBe(initialConcealed + 1);
  });

  it('pong claim resolves immediately and ponger must discard', () => {
    // Force a known-discarding tile by reaching in: synthesize state where seat 1 has two of the discarded tile
    const rng = seededRng(33);
    const s0 = initialState(rng);
    const t = s0.hands[1].concealed[0]!;
    const hacked: GameState = {
      ...s0,
      hands: {
        ...s0.hands,
        0: { ...s0.hands[0], concealed: [t, t, ...s0.hands[0].concealed] },
        1: { ...s0.hands[1], concealed: [t, t, ...s0.hands[1].concealed] },
      },
    };
    // dealer (0) discards t
    let [s] = step(hacked, { t: 'discard', seat: 0, tile: t });
    // seat 1 ponging it
    [s] = step(s, { t: 'claim', seat: 1, kind: 'pong', tiles: [t, t, t] });
    // seat 1 has now exposed a pong, removed 2 from concealed, and must discard
    expect(s.hands[1].exposed.length).toBe(1);
    expect(s.phase.t).toBe('awaitDiscard');
    if (s.phase.t === 'awaitDiscard') expect(s.phase.seat).toBe(1);
  });
});

describe('resolveClaimPriority', () => {
  const t: Tile = { kind: 'honor', honor: 'E' };
  const win = (seat: Seat): Intent => ({ t: 'claim', seat, kind: 'win', tiles: [t] });
  const pong = (seat: Seat): Intent => ({ t: 'claim', seat, kind: 'pong', tiles: [t, t, t] });
  const pass = (seat: Seat): Intent => ({ t: 'pass', seat });

  it('returns null when all pass', () => {
    expect(resolveClaimPriority([pass(1), pass(2), pass(3)], 0)).toBeNull();
  });
  it('win beats pong', () => {
    expect(resolveClaimPriority([pong(1), win(2)], 0)).toEqual(win(2));
  });
  it('head bump: closest seat to discarder wins among ties', () => {
    expect(resolveClaimPriority([win(2), win(3)], 0)).toEqual(win(2));
  });
});

describe('step — declareSelfWin', () => {
  it('transitions to ended with the declarer as winner', () => {
    // Build a contrived 17-tile winning hand on dealer
    const tiles = ['m1','m1','m1','m2','m2','m2','m3','m3','m3','m4','m4','m4','m5','m5','m5','m6','m6']
      .map((id) => parseTileId(id));
    const s0 = initialState(seededRng(50));
    const hacked: GameState = {
      ...s0,
      hands: { ...s0.hands, 0: { concealed: tiles, exposed: [], flowers: [] } },
      phase: { t: 'awaitDiscard', seat: 0 },
    };
    const [next, events] = step(hacked, { t: 'declareSelfWin', seat: 0 });
    expect(next.phase).toEqual(expect.objectContaining({ t: 'ended', winner: 0 }));
    expect(events.some((e) => e.t === 'won')).toBe(true);
  });
});

describe('step — declareConcealedKong', () => {
  it('moves 4 tiles to exposed concealed-kong and draws replacement', () => {
    const fourM5: Tile[] = [
      { kind: 'suit', suit: 'm', rank: 5 },
      { kind: 'suit', suit: 'm', rank: 5 },
      { kind: 'suit', suit: 'm', rank: 5 },
      { kind: 'suit', suit: 'm', rank: 5 },
    ];
    const filler: Tile[] = Array.from({ length: 13 }, (_, i) => ({
      kind: 'suit', suit: 'p', rank: (i % 9 + 1) as 1,
    }));
    const s0 = initialState(seededRng(60));
    const hacked: GameState = {
      ...s0,
      hands: { ...s0.hands, 0: { concealed: [...fourM5, ...filler], exposed: [], flowers: [] } },
      phase: { t: 'awaitDiscard', seat: 0 },
    };
    const [next] = step(hacked, { t: 'declareConcealedKong', seat: 0, tile: fourM5[0]! });
    expect(next.hands[0].exposed.length).toBe(1);
    expect(next.hands[0].exposed[0]?.kind).toBe('kong');
    // 17 - 4 + 1 (replacement) = 14
    expect(next.hands[0].concealed.length).toBe(14);
  });
});
