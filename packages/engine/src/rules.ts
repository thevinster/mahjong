import type { GameState, Intent, Seat } from './game.js';
import type { Tile, SuitTile } from './tiles.js';
import { tileId, tilesEqual } from './tiles.js';
import { isWinningHand, partitionRemainder } from './win.js';

export function legalIntents(state: GameState, seat: Seat): Intent[] {
  const out: Intent[] = [];
  const phase = state.phase;

  if (phase.t === 'awaitDiscard') {
    if (phase.seat !== seat) return out;
    const hand = state.hands[seat];

    // every distinct concealed tile is a legal discard candidate
    const seenIds = new Set<string>();
    for (const t of hand.concealed) {
      const id = tileId(t);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      out.push({ t: 'discard', seat, tile: t });
    }

    // self-win: the concealed remainder must form (5 - exposedMelds) melds + a
    // pair. partitionRemainder enforces the exact tile count itself, so no extra
    // length guard is needed. (A guard on TOTAL tile count is wrong: a kong is 4
    // tiles but only one meld, so a winning hand with K kongs has 17 + K tiles —
    // a `% 3 === 2` check rejects legitimate self-wins whenever K is 1 or 2.)
    const selfWinTargetMelds = 5 - hand.exposed.length;
    if (partitionRemainder(hand.concealed, selfWinTargetMelds).length > 0) {
      out.push({ t: 'declareSelfWin', seat });
    }

    // concealed kong on any 4-of-a-kind in concealed
    const counts = new Map<string, Tile[]>();
    for (const t of hand.concealed) {
      const id = tileId(t);
      counts.set(id, [...(counts.get(id) ?? []), t]);
    }
    for (const [, arr] of counts) {
      if (arr.length === 4) {
        out.push({ t: 'declareConcealedKong', seat, tile: arr[0]! });
      }
    }
    return out;
  }

  if (phase.t === 'awaitClaims') {
    if (!phase.pendingFrom.includes(seat)) return out;
    out.push({ t: 'pass', seat });

    const hand = state.hands[seat];
    const discard = phase.discard;
    const matching = hand.concealed.filter((t) => tilesEqual(t, discard));

    // pong
    if (matching.length >= 2) {
      out.push({
        t: 'claim', seat, kind: 'pong',
        tiles: [discard, matching[0]!, matching[1]!],
      });
    }
    // kong
    if (matching.length >= 3) {
      out.push({
        t: 'claim', seat, kind: 'kong',
        tiles: [discard, matching[0]!, matching[1]!, matching[2]!],
      });
    }
    // chow — only next player in turn order
    if (((phase.from + 1) & 3) === seat && discard.kind === 'suit') {
      const d = discard as SuitTile;
      const has = (rank: number): SuitTile | undefined =>
        hand.concealed.find((t): t is SuitTile =>
          t.kind === 'suit' && t.suit === d.suit && t.rank === rank,
        );
      const variants: [SuitTile, SuitTile, SuitTile][] = [];
      if (d.rank >= 3) {
        const a = has(d.rank - 2), b = has(d.rank - 1);
        if (a && b) variants.push([a, b, d]);
      }
      if (d.rank >= 2 && d.rank <= 8) {
        const a = has(d.rank - 1), c = has(d.rank + 1);
        if (a && c) variants.push([a, d, c]);
      }
      if (d.rank <= 7) {
        const b = has(d.rank + 1), c = has(d.rank + 2);
        if (b && c) variants.push([d, b, c]);
      }
      for (const v of variants) {
        out.push({ t: 'claim', seat, kind: 'chow', tiles: v });
      }
    }
    // ron: hand + discard forms a winning hand
    const exposedMeldCount = hand.exposed.length;
    const targetMelds = 5 - exposedMeldCount;
    if (partitionRemainder([...hand.concealed, discard], targetMelds).length > 0) {
      out.push({ t: 'claim', seat, kind: 'win', tiles: [discard] });
    }
    return out;
  }

  return out;
}
