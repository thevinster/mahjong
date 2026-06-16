import type { Hand } from '../hand.js';
import type { Tile, FlowerTile } from '../tiles.js';
import type { Meld } from '../meld.js';
import type { Intent, Phase, Seat } from '../game.js';
import type { Rng } from '../rng.js';

export type OpponentView = {
  concealedCount: number;
  exposed: readonly Meld[];
  flowers: readonly FlowerTile[];
};

export type BotView = {
  seat: Seat;
  myHand: Hand;
  opponents: Record<Seat, OpponentView>;
  discards: readonly { seat: Seat; tile: Tile }[];
  wallRemaining: number;
  phase: Phase;
  legalIntents: readonly Intent[];
  rng: Rng;
};

export type BotPolicy = {
  name: string;
  decide(view: BotView): Intent;
};
