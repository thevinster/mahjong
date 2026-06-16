import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getOrIssuePlayerId } from '@/lib/identity.js';
import { getRoom } from '@/lib/rooms.js';
import { casRoom } from '@/lib/kv.js';
import { initialState, seededRng, heuristicPolicy, type Seat } from '@mahjong/engine';
import { runBotTurnsInline } from '@/lib/bot-scheduler.js';
import { broadcastEvent } from '@/lib/pusher-server.js';

export const runtime = 'nodejs';
const SEATS: readonly Seat[] = [0, 1, 2, 3];

export async function POST(_req: NextRequest, ctx: { params: { code: string } }): Promise<NextResponse> {
  const playerId = getOrIssuePlayerId();
  for (let attempt = 0; attempt < 5; attempt++) {
    const room = await getRoom(ctx.params.code);
    if (!room) return NextResponse.json({ error: 'room not found' }, { status: 404 });
    if (room.host !== playerId) return NextResponse.json({ error: 'host only' }, { status: 403 });
    if (room.phase !== 'lobby') return NextResponse.json({ error: 'already started' }, { status: 409 });
    for (const seat of SEATS) {
      if (room.seats[seat].kind === 'empty') {
        room.seats[seat] = { kind: 'bot', policyName: heuristicPolicy.name };
      }
    }
    const seed = randomBytes(4).readUInt32BE(0);
    room.state = initialState(seededRng(seed));
    room.phase = 'playing';
    // Run any leading bot turns synchronously (host is always seat 0 / human, so this is usually a no-op)
    const events = runBotTurnsInline(room);
    const ok = await casRoom(room.code, room.version, room);
    if (!ok) continue;
    // Broadcast events after successful write
    for (const ev of events) {
      room.seq += 1;
      await broadcastEvent(room.code, ev, room.seq);
    }
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json({ error: 'conflict' }, { status: 409 });
}
