import type { BotPolicy, BotView } from './policy.js';
import type { Intent, Seat } from '../game.js';
import type { Tile } from '../tiles.js';
import { tileId } from '../tiles.js';
import { shanten } from './shanten.js';

export const heuristicPolicy: BotPolicy = {
  name: 'heuristic-v1',
  decide(view: BotView): Intent {
    // 1) Always take a win
    const winIntent = view.legalIntents.find((i) =>
      i.t === 'declareSelfWin'
      || (i.t === 'claim' && i.kind === 'win'),
    );
    if (winIntent) return winIntent;

    if (view.phase.t === 'awaitClaims') return chooseClaim(view);
    if (view.phase.t === 'awaitDiscard') return chooseDiscard(view);
    return { t: 'pass', seat: view.seat };
  },
};

function chooseClaim(view: BotView): Intent {
  const myShanten = shanten(view.myHand.concealed);
  const claims = view.legalIntents.filter((i) => i.t === 'claim') as Array<Extract<Intent, { t: 'claim' }>>;
  for (const c of claims) {
    if (c.kind === 'kong') {
      // Take kong if shanten doesn't worsen (treat as keeping shanten)
      if (myShanten <= 1) return c;
    } else if (c.kind === 'pong') {
      // Simulate: after pong, check shanten of remaining concealed minus 2 of the tile
      const remaining = removeN(view.myHand.concealed, c.tiles[1]!, 2);
      if (shanten(remaining) < myShanten) return c;
      if (myShanten <= 1 && c.tiles[0]!.kind === 'honor') return c;
    } else if (c.kind === 'chow') {
      const remaining = removeChowTiles(view.myHand.concealed, c.tiles);
      if (shanten(remaining) < myShanten) return c;
    }
  }
  return { t: 'pass', seat: view.seat };
}

function chooseDiscard(view: BotView): Intent {
  // Concealed kong has highest priority when shanten doesn't change
  const ck = view.legalIntents.find((i) => i.t === 'declareConcealedKong');
  if (ck) return ck;

  const discards = view.legalIntents.filter((i) => i.t === 'discard') as Array<Extract<Intent, { t: 'discard' }>>;
  if (discards.length === 0) return { t: 'pass', seat: view.seat };

  let best = discards[0]!;
  let bestScore = scoreDiscard(view, best);
  for (const d of discards.slice(1)) {
    const s = scoreDiscard(view, d);
    if (s.lt(bestScore)) { best = d; bestScore = s; }
  }
  return best;
}

class TupleScore {
  constructor(public a: number, public b: number, public c: number, public r: number) {}
  lt(o: TupleScore): boolean {
    if (this.a !== o.a) return this.a < o.a;
    if (this.b !== o.b) return this.b > o.b; // higher tileValue is better
    if (this.c !== o.c) return this.c < o.c;
    return this.r < o.r;
  }
}

function scoreDiscard(view: BotView, d: Extract<Intent, { t: 'discard' }>): TupleScore {
  const remaining = view.myHand.concealed.filter((c) => c !== d.tile);
  const newShanten = shanten(remaining);
  const tileValue = nearbyValue(view.myHand.concealed, d.tile);
  const danger = dangerScore(view, d.tile);
  return new TupleScore(newShanten, tileValue, danger, view.rng());
}

function nearbyValue(concealed: readonly Tile[], t: Tile): number {
  // Pairs and near-runs in the same suit increase value
  if (t.kind !== 'suit') {
    return concealed.filter((c) => c.kind === 'honor' && t.kind === 'honor' && c.honor === t.honor).length;
  }
  let v = 0;
  for (const c of concealed) {
    if (c.kind !== 'suit' || c.suit !== t.suit) continue;
    const d = Math.abs(c.rank - t.rank);
    if (d === 0) v += 2;
    else if (d === 1) v += 1;
    else if (d === 2) v += 0.5;
  }
  return v;
}

function dangerScore(view: BotView, t: Tile): number {
  let d = 0;
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    if (seat === view.seat) continue;
    for (const m of view.opponents[seat].exposed) {
      const exposedTile = m.kind === 'chow' ? m.tiles[0] : m.tile;
      if (exposedTile.kind === 'suit' && t.kind === 'suit' && exposedTile.suit === t.suit) d += 1;
    }
  }
  if (t.kind === 'suit' && t.rank >= 3 && t.rank <= 7 && view.discards.length > 32) d += 0.5;
  return d;
}

function removeN(arr: readonly Tile[], target: Tile, n: number): Tile[] {
  const out = [...arr];
  let removed = 0;
  for (let i = out.length - 1; i >= 0 && removed < n; i--) {
    if (tileId(out[i]!) === tileId(target)) { out.splice(i, 1); removed++; }
  }
  return out;
}

function removeChowTiles(concealed: readonly Tile[], chow: readonly Tile[]): Tile[] {
  const out = [...concealed];
  // Remove two of the chow tiles from concealed (the third came from discard)
  // We don't know which was claimed; remove the two that match concealed
  for (const t of chow) {
    const idx = out.findIndex((c) => tileId(c) === tileId(t));
    if (idx >= 0) out.splice(idx, 1);
    if (out.length === concealed.length - 2) break;
  }
  return out;
}
