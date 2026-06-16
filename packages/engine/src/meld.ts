import type { Tile, SuitTile } from './tiles.js';
import { tileId, tilesEqual } from './tiles.js';
import type { Seat } from './game.js';

export type ChowTiles = [SuitTile, SuitTile, SuitTile];

export type Meld =
  | { kind: 'chow'; tiles: ChowTiles; claimedFrom?: Seat }
  | { kind: 'pong'; tile: Tile;       claimedFrom?: Seat }
  | { kind: 'kong'; tile: Tile;       concealed: boolean; claimedFrom?: Seat };

export function makePong(ts: [Tile, Tile, Tile], claimedFrom?: Seat): Extract<Meld, {kind:'pong'}> {
  if (!tilesEqual(ts[0], ts[1]) || !tilesEqual(ts[1], ts[2])) {
    throw new Error(`pong requires identical tiles, got ${ts.map(tileId).join(',')}`);
  }
  return claimedFrom === undefined
    ? { kind: 'pong', tile: ts[0] }
    : { kind: 'pong', tile: ts[0], claimedFrom };
}

export function makeChow(ts: [Tile, Tile, Tile], claimedFrom?: Seat): Extract<Meld, {kind:'chow'}> {
  if (!ts.every((t): t is SuitTile => t.kind === 'suit')) {
    throw new Error(`chow requires suit tiles, got ${ts.map(tileId).join(',')}`);
  }
  const sts = ts as ChowTiles;
  if (sts[0].suit !== sts[1].suit || sts[1].suit !== sts[2].suit) {
    throw new Error(`chow requires single suit, got ${ts.map(tileId).join(',')}`);
  }
  if (sts[1].rank !== sts[0].rank + 1 || sts[2].rank !== sts[1].rank + 1) {
    throw new Error(`chow requires consecutive sorted ranks, got ${ts.map(tileId).join(',')}`);
  }
  return claimedFrom === undefined
    ? { kind: 'chow', tiles: sts }
    : { kind: 'chow', tiles: sts, claimedFrom };
}

export function makeKong(
  ts: [Tile, Tile, Tile, Tile],
  concealed: boolean,
  claimedFrom?: Seat,
): Extract<Meld, {kind:'kong'}> {
  if (!ts.slice(1).every((t) => tilesEqual(t, ts[0]))) {
    throw new Error(`kong requires identical tiles, got ${ts.map(tileId).join(',')}`);
  }
  return claimedFrom === undefined
    ? { kind: 'kong', tile: ts[0], concealed }
    : { kind: 'kong', tile: ts[0], concealed, claimedFrom };
}

export function isChowable(ts: readonly Tile[]): boolean {
  if (ts.length !== 3) return false;
  try { makeChow(ts as [Tile, Tile, Tile]); return true; } catch { return false; }
}

export function meldTiles(m: Meld): Tile[] {
  switch (m.kind) {
    case 'chow': return [...m.tiles];
    case 'pong': return [m.tile, m.tile, m.tile];
    case 'kong': return [m.tile, m.tile, m.tile, m.tile];
  }
}
