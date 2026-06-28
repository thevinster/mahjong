import type { Intent, Tile } from '@mahjong/engine';

/**
 * The tiles a claim/kong button refers to, so the ActionBar can render them as
 * tile faces (otherwise "Chow 1" / "Pong" don't say WHICH tiles are meant).
 *
 * - claim (chow/pong/kong/win): the intent's own `tiles` (chow tiles are already
 *   rank-sorted by the rules engine; pong/kong are identical copies; win is the
 *   single completing discard).
 * - declareConcealedKong: the single tile expanded to the four it kongs.
 * - pass / declareSelfWin / discard: no specific tiles to show.
 */
export function claimTiles(intent: Intent): Tile[] {
  if (intent.t === 'claim') return [...intent.tiles];
  if (intent.t === 'declareConcealedKong') {
    return [intent.tile, intent.tile, intent.tile, intent.tile];
  }
  return [];
}
