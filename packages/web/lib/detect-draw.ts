import { tileId, type Tile } from '@mahjong/engine';
import type { RoomSnapshot } from './protocol';

/**
 * Identify the tile the viewer just drew by diffing their concealed hand between
 * two consecutive snapshots. This is snapshot-driven (not event-driven) so the
 * "just drew" highlight fires on BOTH the realtime push and the polling fallback
 * — i.e. whenever the hand actually changes — instead of only when a Pusher
 * `drew` event is delivered.
 *
 * A draw is the hand growing by exactly one tile. Anything else (a discard, a
 * claim that shrinks the hand, an unchanged poll, the first load, a >1 jump from
 * a missed intermediate state, or a viewer who can't see concealed tiles) is not
 * a single unambiguous draw, so we return null and highlight nothing.
 */
export function detectDraw(prev: RoomSnapshot | null, next: RoomSnapshot): string | null {
  const seat = next.viewerSeat;
  if (seat === null) return null;

  const nextHand = next.state?.hands[seat];
  if (!nextHand || !nextHand.own) return null;

  // Need a comparable prior hand for the SAME seat (own view).
  if (!prev || prev.viewerSeat !== seat) return null;
  const prevHand = prev.state?.hands[seat];
  if (!prevHand || !prevHand.own) return null;

  const before = prevHand.concealed;
  const after = nextHand.concealed;
  if (after.length !== before.length + 1) return null; // only a single-tile gain is a draw

  const beforeCounts = countById(before);
  const afterCounts = countById(after);
  for (const id of Object.keys(afterCounts)) {
    if (afterCounts[id]! > (beforeCounts[id] ?? 0)) return id;
  }
  return null;
}

function countById(tiles: readonly Tile[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of tiles) {
    const id = tileId(t);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
