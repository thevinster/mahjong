import type { Tile } from '../tiles.js';
import { tileId } from '../tiles.js';
import { isWinningHand } from '../win.js';

/**
 * Orphan-count quality metric for hand evaluation.
 * - Returns -1 if the hand already wins (passed to win-detector).
 * - Otherwise returns the number of tiles in the hand that are NOT part of
 *   any pair (>= 2 of same id) AND have no near-neighbor in the same suit
 *   (rank ±1 or ±2). Flowers are excluded from the count.
 *
 * Lower is better. The bot uses this to compare hands after candidate
 * discards: argmin of orphan-count is a sensible "discard the most useless
 * tile" rule for the competent-beginner bar.
 *
 * This is intentionally NOT strict mahjong shanten — that requires
 * exponential search to compute exactly and offers little extra value for a
 * heuristic that just needs monotonic ordering.
 */
export function shanten(tiles: readonly Tile[]): number {
  if (isWinningHand(tiles)) return -1;
  const filtered = tiles.filter((t) => t.kind !== 'flower');
  const counts = new Map<string, number>();
  for (const t of filtered) {
    const id = tileId(t);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let orphans = 0;
  for (const t of filtered) {
    const id = tileId(t);
    if ((counts.get(id) ?? 0) >= 2) continue;          // paired
    if (t.kind === 'suit') {
      const neighborIds = [
        `${t.suit}${t.rank - 2}`,
        `${t.suit}${t.rank - 1}`,
        `${t.suit}${t.rank + 1}`,
        `${t.suit}${t.rank + 2}`,
      ];
      if (neighborIds.some((nid) => (counts.get(nid) ?? 0) > 0)) continue;
    }
    orphans++;
  }
  return orphans;
}
