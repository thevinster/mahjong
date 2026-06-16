import type { Tile, SuitTile, HonorTile, Rank } from './tiles.js';
import { tileId } from './tiles.js';

export type Partition = {
  melds: readonly (
    | { kind: 'pong'; tile: Tile }
    | { kind: 'chow'; tiles: [SuitTile, SuitTile, SuitTile] }
  )[];
  pair: readonly [Tile, Tile];
};

/**
 * Recursive partitioner. Input: 17 tiles (no flowers).
 * Returns ALL distinct partitions into 5 melds + 1 pair.
 * Caller may pass tiles for fewer melds (when some are already exposed) —
 * pass the concealed remainder + winning tile and the required pair.
 *
 * For partial cases (e.g. 11 tiles + 2 melds exposed), use partitionRemainder.
 */
export function findWinPartitions(tiles: readonly Tile[]): Partition[] {
  if (tiles.length % 3 !== 2) return [];
  const targetMelds = (tiles.length - 2) / 3;
  return partitionRemainder(tiles, targetMelds);
}

export function partitionRemainder(
  tiles: readonly Tile[],
  needMelds: number,
): Partition[] {
  // Strip out flowers (shouldn't be here but safety)
  const filtered = tiles.filter((t) => t.kind !== 'flower');
  if (filtered.length !== needMelds * 3 + 2) return [];
  const counts = countMap(filtered);
  const out: Partition[] = [];
  // Try every distinct tile as pair
  for (const id of [...counts.keys()]) {
    if ((counts.get(id) ?? 0) >= 2) {
      const next = new Map(counts);
      next.set(id, next.get(id)! - 2);
      const pairTile = idToTile(id);
      for (const melds of enumerateMelds(next, needMelds)) {
        out.push({ melds, pair: [pairTile, pairTile] });
      }
    }
  }
  // De-dupe by signature
  return dedupePartitions(out);
}

export function isWinningHand(tiles: readonly Tile[]): boolean {
  return findWinPartitions(tiles).length > 0;
}

// ---- helpers ----

function countMap(tiles: readonly Tile[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tiles) {
    const id = tileId(t);
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

function idToTile(id: string): Tile {
  // Inline minimal parser to avoid circular import overhead
  if (id.length === 2 && (id[0] === 'm' || id[0] === 'p' || id[0] === 's')) {
    const rank = Number(id[1]);
    if (!Number.isInteger(rank) || rank < 1 || rank > 9) {
      throw new Error(`idToTile: bad rank in ${id}`);
    }
    return { kind: 'suit', suit: id[0] as SuitTile['suit'], rank: rank as Rank };
  }
  if (id === 'E' || id === 'S' || id === 'W' || id === 'N'
      || id === 'R' || id === 'G' || id === 'Wh') {
    return { kind: 'honor', honor: id };
  }
  throw new Error(`idToTile: ${id}`);
}

type SimpleMeld =
  | { kind: 'pong'; tile: Tile }
  | { kind: 'chow'; tiles: [SuitTile, SuitTile, SuitTile] };

function* enumerateMelds(
  counts: Map<string, number>,
  remaining: number,
): Generator<SimpleMeld[]> {
  if (remaining === 0) {
    if ([...counts.values()].every((v) => v === 0)) yield [];
    return;
  }
  // Pick the smallest-keyed tile with count > 0 to anchor next meld
  const anchor = [...counts.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => keyOrder(a[0]) - keyOrder(b[0]))[0];
  if (!anchor) return;
  const [id, ct] = anchor;
  const tile = idToTile(id);

  // Option A: pong
  if (ct >= 3) {
    const next = new Map(counts);
    next.set(id, ct - 3);
    for (const rest of enumerateMelds(next, remaining - 1)) {
      yield [{ kind: 'pong', tile }, ...rest];
    }
  }
  // Option B: chow starting at this tile (only suits, rank ≤ 7)
  if (tile.kind === 'suit' && tile.rank <= 7) {
    const id2 = `${tile.suit}${tile.rank + 1}`;
    const id3 = `${tile.suit}${tile.rank + 2}`;
    if ((counts.get(id2) ?? 0) > 0 && (counts.get(id3) ?? 0) > 0) {
      const next = new Map(counts);
      next.set(id,  ct - 1);
      next.set(id2, next.get(id2)! - 1);
      next.set(id3, next.get(id3)! - 1);
      const t2 = idToTile(id2) as SuitTile;
      const t3 = idToTile(id3) as SuitTile;
      for (const rest of enumerateMelds(next, remaining - 1)) {
        yield [{ kind: 'chow', tiles: [tile, t2, t3] }, ...rest];
      }
    }
  }
}

const SUIT_OFFSET: Record<string, number> = { m: 0, p: 9, s: 18 };
function keyOrder(id: string): number {
  const first = id[0];
  if (id.length === 2 && first !== undefined && first in SUIT_OFFSET) {
    return SUIT_OFFSET[first]! + Number(id[1]) - 1;
  }
  // honors after suits
  return 100 + (['E','S','W','N','R','G','Wh'].indexOf(id));
}

function dedupePartitions(parts: Partition[]): Partition[] {
  const seen = new Set<string>();
  const out: Partition[] = [];
  for (const p of parts) {
    const sig = partitionSignature(p);
    if (!seen.has(sig)) { seen.add(sig); out.push(p); }
  }
  return out;
}

function partitionSignature(p: Partition): string {
  const meldSigs = p.melds.map((m) => {
    if (m.kind === 'pong') return `P${tileId(m.tile)}`;
    return `C${m.tiles.map(tileId).join('')}`;
  }).sort();
  return `${tileId(p.pair[0])}|${meldSigs.join(',')}`;
}
