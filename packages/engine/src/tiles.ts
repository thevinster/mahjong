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
