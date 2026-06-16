export const ENGINE_VERSION = '0.1.0';

export type { Suit, Honor, Flower, Rank, SuitTile, HonorTile, FlowerTile, Tile } from './tiles.js';
export { tileId, parseTileId, tilesEqual, buildDeck, sortTiles } from './tiles.js';

export type { Rng } from './rng.js';
export { seededRng, shuffle } from './rng.js';

export type { Hand } from './hand.js';
export { emptyHand, addTile, removeTile, sortedConcealed, countTile } from './hand.js';

export type { ChowTiles, Meld } from './meld.js';
export { makePong, makeChow, makeKong, isChowable, meldTiles } from './meld.js';

export type { Event, TaiItem } from './events.js';

export type { Seat, Phase, GameState, Intent, RedactedHand, RedactedGameState } from './game.js';
export { SEATS, initialState, step, redactFor, resolveClaimPriority } from './game.js';

export { legalIntents } from './rules.js';

export type { ScoreInput, ScoreResult } from './score.js';
export { scoreWin } from './score.js';

export { findWinPartitions, isWinningHand, partitionRemainder } from './win.js';
export type { Partition } from './win.js';

export type { BotPolicy, BotView, OpponentView } from './bot/policy.js';
export { buildBotView } from './bot/view.js';
export { randomPolicy } from './bot/random.js';
export { heuristicPolicy } from './bot/heuristic.js';
export { shanten } from './bot/shanten.js';
