import {
  step, legalIntents, resolveClaimPriority,
  type Intent, type Event, type Seat, type Tile,
} from '@mahjong/engine';
import type { Room } from './rooms.js';

export type ApplyResult =
  | { ok: true;  events: Event[] }
  | { ok: false; code: string; message: string };

export function applyIntent(room: Room, fromSeat: Seat, intent: Intent): ApplyResult {
  if (!room.state) return { ok: false, code: 'no_state', message: 'room not started' };
  if (intent.seat !== fromSeat) {
    return { ok: false, code: 'wrong_seat', message: 'intent seat must equal sender' };
  }
  const legal = legalIntents(room.state, fromSeat);
  if (!legal.some((i) => sameIntent(i, intent))) {
    return { ok: false, code: 'illegal', message: 'intent not legal in current phase' };
  }

  if (room.state.phase.t === 'awaitClaims') {
    room.pendingClaims[String(fromSeat)] = intent;
    const allResponded = room.state.phase.pendingFrom.every((s) => String(s) in room.pendingClaims);
    if (!allResponded) return { ok: true, events: [] };
    const intentsByPriority = room.state.phase.pendingFrom.map((s) => room.pendingClaims[String(s)] as Intent);
    const discarder = room.state.phase.from;
    room.pendingClaims = {};
    const winning = resolveClaimPriority(intentsByPriority, discarder);
    if (winning) return runStep(room, winning);
    // All passed → feed each pass to step sequentially (engine shrinks pendingFrom)
    const events: Event[] = [];
    for (const pass of intentsByPriority) {
      if (pass.t !== 'pass') continue;
      const r = runStep(room, pass);
      if (r.ok) events.push(...r.events);
      else return r;
    }
    return { ok: true, events };
  }

  return runStep(room, intent);
}

function runStep(room: Room, intent: Intent): ApplyResult {
  const [next, events] = step(room.state!, intent);
  room.state = next;
  return { ok: true, events };
}

function sameIntent(a: Intent, b: Intent): boolean {
  if (a.t !== b.t) return false;
  if (a.seat !== b.seat) return false;
  if (a.t === 'discard'              && b.t === 'discard')              return tileSig(a.tile) === tileSig(b.tile);
  if (a.t === 'pass'                 && b.t === 'pass')                 return true;
  if (a.t === 'declareSelfWin'       && b.t === 'declareSelfWin')       return true;
  if (a.t === 'declareConcealedKong' && b.t === 'declareConcealedKong') return tileSig(a.tile) === tileSig(b.tile);
  if (a.t === 'claim'                && b.t === 'claim'                && a.kind === b.kind) {
    if (a.tiles.length !== b.tiles.length) return false;
    return a.tiles.every((t, i) => tileSig(t) === tileSig(b.tiles[i]!));
  }
  return false;
}

function tileSig(t: Tile): string {
  switch (t.kind) {
    case 'suit':   return `${t.suit}${t.rank}`;
    case 'honor':  return t.honor;
    case 'flower': return t.flower;
  }
}
