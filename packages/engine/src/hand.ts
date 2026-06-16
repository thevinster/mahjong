import type { Tile, FlowerTile } from './tiles.js';
import { tileId, sortTiles, tilesEqual } from './tiles.js';
import type { Meld } from './meld.js';

export type Hand = {
  readonly concealed: readonly Tile[];
  readonly exposed: readonly Meld[];
  readonly flowers: readonly FlowerTile[];
};

export function emptyHand(): Hand {
  return { concealed: [], exposed: [], flowers: [] };
}

export function addTile(h: Hand, t: Tile): Hand {
  if (t.kind === 'flower') {
    return { ...h, flowers: [...h.flowers, t] };
  }
  return { ...h, concealed: [...h.concealed, t] };
}

export function removeTile(h: Hand, t: Tile): Hand {
  const idx = h.concealed.findIndex((c) => tilesEqual(c, t));
  if (idx === -1) {
    throw new Error(`removeTile: ${tileId(t)} not in concealed`);
  }
  return {
    ...h,
    concealed: [...h.concealed.slice(0, idx), ...h.concealed.slice(idx + 1)],
  };
}

export function sortedConcealed(h: Hand): Tile[] {
  return sortTiles(h.concealed);
}

export function countTile(h: Hand, t: Tile): number {
  return h.concealed.filter((c) => tilesEqual(c, t)).length;
}
