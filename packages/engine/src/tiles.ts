export type Suit = 'm' | 'p' | 's';
export type Honor = 'E' | 'S' | 'W' | 'N' | 'R' | 'G' | 'Wh';
export type Flower =
  | 'F1' | 'F2' | 'F3' | 'F4'
  | 'S1' | 'S2' | 'S3' | 'S4';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type SuitTile   = { kind: 'suit';   suit: Suit; rank: Rank };
export type HonorTile  = { kind: 'honor';  honor: Honor };
export type FlowerTile = { kind: 'flower'; flower: Flower };
export type Tile = SuitTile | HonorTile | FlowerTile;

const HONORS: ReadonlySet<string> = new Set(['E','S','W','N','R','G','Wh']);
const FLOWERS: ReadonlySet<string> = new Set([
  'F1','F2','F3','F4','S1','S2','S3','S4',
]);

export function tileId(t: Tile): string {
  switch (t.kind) {
    case 'suit':   return `${t.suit}${t.rank}`;
    case 'honor':  return t.honor;
    case 'flower': return t.flower;
  }
}

export function parseTileId(id: string): Tile {
  if (id.length === 2 && (id[0] === 'm' || id[0] === 'p' || id[0] === 's')) {
    const rank = Number(id[1]);
    if (!Number.isInteger(rank) || rank < 1 || rank > 9) {
      throw new Error(`bad tileId rank: ${id}`);
    }
    return { kind: 'suit', suit: id[0] as Suit, rank: rank as Rank };
  }
  if (HONORS.has(id))  return { kind: 'honor',  honor:  id as Honor };
  if (FLOWERS.has(id)) return { kind: 'flower', flower: id as Flower };
  throw new Error(`bad tileId: ${id}`);
}

export function tilesEqual(a: Tile, b: Tile): boolean {
  return tileId(a) === tileId(b);
}

const SUITS: readonly Suit[] = ['m', 'p', 's'];
const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const HONOR_LIST: readonly Honor[] = ['E','S','W','N','R','G','Wh'];
const FLOWER_LIST: readonly Flower[] = [
  'F1','F2','F3','F4','S1','S2','S3','S4',
];

export function buildDeck(): Tile[] {
  const deck: Tile[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      for (let i = 0; i < 4; i++) deck.push({ kind: 'suit', suit, rank });
    }
  }
  for (const honor of HONOR_LIST) {
    for (let i = 0; i < 4; i++) deck.push({ kind: 'honor', honor });
  }
  for (const flower of FLOWER_LIST) {
    deck.push({ kind: 'flower', flower });
  }
  return deck;
}

const SUIT_ORDER: Record<Suit, number> = { m: 0, p: 1, s: 2 };
const HONOR_ORDER: Record<Honor, number> = {
  E: 0, S: 1, W: 2, N: 3, R: 4, G: 5, Wh: 6,
};
const FLOWER_ORDER: Record<Flower, number> = {
  F1: 0, F2: 1, F3: 2, F4: 3, S1: 4, S2: 5, S3: 6, S4: 7,
};

function tileSortKey(t: Tile): number {
  // suits 0..26, honors 100..106, flowers 200..207
  switch (t.kind) {
    case 'suit':   return SUIT_ORDER[t.suit] * 9 + (t.rank - 1);
    case 'honor':  return 100 + HONOR_ORDER[t.honor];
    case 'flower': return 200 + FLOWER_ORDER[t.flower];
  }
}

export function sortTiles(tiles: readonly Tile[]): Tile[] {
  return [...tiles].sort((a, b) => tileSortKey(a) - tileSortKey(b));
}
