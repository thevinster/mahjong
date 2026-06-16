import type { Hand } from './hand.js';
import type { Tile } from './tiles.js';
import type { Seat } from './game.js';
import { findWinPartitions, partitionRemainder } from './win.js';
import { meldTiles } from './meld.js';
import type { TaiItem } from './events.js';

export type ScoreInput = {
  hand: Hand;
  winningTile: Tile;
  from: Seat | 'self';
  seatWind: 'E'|'S'|'W'|'N';
  prevailingWind: 'E'|'S'|'W'|'N';
};

export type ScoreResult = { tai: number; breakdown: TaiItem[] };

export function scoreWin(input: ScoreInput): ScoreResult {
  const breakdown: TaiItem[] = [];
  // Base
  breakdown.push({ name: 'base', tai: 1 });
  // Self-draw
  if (input.from === 'self') breakdown.push({ name: 'self-draw', tai: 1 });
  // Flowers
  for (const f of input.hand.flowers) {
    breakdown.push({ name: 'flower', tai: 1 });
    void f;
  }
  // Honor scoring: any pong/kong of dragons (R/G/Wh), seat wind, or prevailing wind
  const allMelds = bestPartitionMelds(input.hand);
  for (const m of allMelds) {
    if (m.kind !== 'pong' && m.kind !== 'kong') continue;
    const t = (m.kind === 'pong') ? m.tile : m.tile;
    if (t.kind !== 'honor') continue;
    if (t.honor === 'R' || t.honor === 'G' || t.honor === 'Wh') {
      breakdown.push({ name: `dragon-${t.honor}`, tai: 1 });
    } else if (t.honor === input.seatWind) {
      breakdown.push({ name: 'seat-wind', tai: 1 });
    }
    if (t.kind === 'honor' && t.honor === input.prevailingWind) {
      breakdown.push({ name: 'prevailing-wind', tai: 1 });
    }
  }
  // Also count honor pongs from already-exposed melds
  for (const m of input.hand.exposed) {
    if (m.kind === 'chow') continue;
    const t = m.tile;
    if (t.kind !== 'honor') continue;
    if (t.honor === 'R' || t.honor === 'G' || t.honor === 'Wh') {
      breakdown.push({ name: `dragon-${t.honor}-exposed`, tai: 1 });
    } else if (t.honor === input.seatWind) {
      breakdown.push({ name: 'seat-wind-exposed', tai: 1 });
    }
    if (t.kind === 'honor' && t.honor === input.prevailingWind) {
      breakdown.push({ name: 'prevailing-wind-exposed', tai: 1 });
    }
  }

  const tai = breakdown.reduce((n, b) => n + b.tai, 0);
  return { tai, breakdown };
}

function bestPartitionMelds(hand: Hand) {
  const exposedMelds = hand.exposed.length;
  const targetMelds = 5 - exposedMelds;
  const parts = partitionRemainder(hand.concealed, targetMelds);
  if (parts.length === 0) return [];
  // pick the partition with the most honor pongs (highest tai)
  let best = parts[0]!;
  let bestHonorCount = -1;
  for (const p of parts) {
    const honorPongs = p.melds.filter((m) => m.kind === 'pong' && (m as { tile: Tile }).tile.kind === 'honor').length;
    if (honorPongs > bestHonorCount) { best = p; bestHonorCount = honorPongs; }
  }
  return best.melds.map((m) =>
    m.kind === 'pong'
      ? { kind: 'pong' as const, tile: m.tile }
      : { kind: 'chow' as const, tiles: m.tiles });
}
