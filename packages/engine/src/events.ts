import type { Tile, FlowerTile } from './tiles.js';
import type { Meld } from './meld.js';
import type { Seat } from './game.js';

export type TaiItem = { name: string; tai: number };

export type Event =
  | { t: 'dealt' }
  | { t: 'drew';           seat: Seat; tileForSeat?: Tile }
  | { t: 'discarded';      seat: Seat; tile: Tile }
  | { t: 'flowerReplaced'; seat: Seat; flower: FlowerTile; replacement?: Tile }
  | { t: 'melded';         seat: Seat; meld: Meld }
  | { t: 'won';            seat: Seat; from: Seat | 'self'; score: number; breakdown: readonly TaiItem[] }
  | { t: 'drawWall' };
