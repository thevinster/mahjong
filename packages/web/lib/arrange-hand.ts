import { sortTiles, tileId, type Tile } from '@mahjong/engine';

export type ArrangedTile = { tile: Tile; key: string; drawn: boolean };

/**
 * Produce the left-to-right render order for the player's hand.
 *
 * - `manualOrder` (tile ids): when set, tiles follow that order; any tiles not
 *   in it (e.g. a freshly drawn tile) are appended in sorted order; ids no
 *   longer in hand are dropped. When null, the hand is auto-sorted (sortTiles).
 * - `drawnId`: when set and present, the most-recently-drawn copy is pulled to
 *   the end and flagged `drawn` (the UI highlights it briefly, then it blends in
 *   once `drawnId` is cleared).
 *
 * Keys are stable per arrangement (id + occurrence) so React can track tiles
 * across re-renders even with duplicates.
 */
export function arrangeHand(
  concealed: readonly Tile[],
  manualOrder: readonly string[] | null,
  drawnId: string | null,
): ArrangedTile[] {
  let base: Tile[];
  if (manualOrder && manualOrder.length > 0) {
    const pool = [...concealed];
    base = [];
    for (const id of manualOrder) {
      const idx = pool.findIndex((t) => tileId(t) === id);
      if (idx !== -1) base.push(pool.splice(idx, 1)[0]!);
    }
    base.push(...sortTiles(pool)); // newly drawn / unplaced tiles, tidy
  } else {
    base = sortTiles(concealed);
  }

  // Pull the LAST matching copy to the end (in manual mode that's the freshly
  // appended draw; in auto mode it's the rightmost of the adjacent group).
  let drawnIdx = -1;
  if (drawnId) {
    for (let i = base.length - 1; i >= 0; i--) {
      if (tileId(base[i]!) === drawnId) { drawnIdx = i; break; }
    }
  }

  let ordered: { tile: Tile; drawn: boolean }[];
  if (drawnIdx !== -1) {
    const drawnTile = base[drawnIdx]!;
    const rest = [...base.slice(0, drawnIdx), ...base.slice(drawnIdx + 1)];
    ordered = [...rest.map((t) => ({ tile: t, drawn: false })), { tile: drawnTile, drawn: true }];
  } else {
    ordered = base.map((t) => ({ tile: t, drawn: false }));
  }

  const counts: Record<string, number> = {};
  return ordered.map(({ tile, drawn }) => {
    const id = tileId(tile);
    const n = counts[id] = (counts[id] ?? 0) + 1;
    return { tile, key: `${id}#${n}`, drawn };
  });
}
