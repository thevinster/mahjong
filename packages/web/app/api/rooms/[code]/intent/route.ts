import { NextResponse, type NextRequest } from 'next/server';
import { getOrIssuePlayerId } from '@/lib/identity';
import { getRoom } from '@/lib/rooms';
import { casRoom } from '@/lib/kv';
import { applyIntent } from '@/lib/dispatcher';
import { runBotTurnsInline, armTurnDeadline } from '@/lib/bot-scheduler';
import { reconcileGrace } from '@/lib/grace';
import { broadcastEvent } from '@/lib/pusher-server';
import type { Seat } from '@mahjong/engine';
import type { IntentRequest, IntentResponse } from '@/lib/protocol';

export const runtime = 'nodejs';
const SEATS: readonly Seat[] = [0, 1, 2, 3];
const MAX_RETRIES = 5;

export async function POST(req: NextRequest, ctx: { params: { code: string } }): Promise<NextResponse<IntentResponse>> {
  const playerId = getOrIssuePlayerId();
  const body: IntentRequest = await req.json();
  if (!body?.intent) return NextResponse.json({ ok: false, error: { code: 'bad_request', message: 'missing intent' } }, { status: 400 });

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const room = await getRoom(ctx.params.code);
    if (!room) return NextResponse.json({ ok: false, error: { code: 'no_room', message: 'room not found' } }, { status: 404 });
    reconcileGrace(room);
    let seat: Seat | null = null;
    for (const s of SEATS) {
      const b = room.seats[s];
      if (b.kind === 'human' && b.playerId === playerId) { seat = s; break; }
    }
    if (seat === null) return NextResponse.json({ ok: false, error: { code: 'not_seated', message: 'not seated' } }, { status: 403 });

    const result = applyIntent(room, seat, body.intent);
    if (!result.ok) return NextResponse.json({ ok: false, error: { code: result.code, message: result.message } }, { status: 400 });

    const botEvents = runBotTurnsInline(room);
    const allEvents = [...result.events, ...botEvents];

    // Reset the turn clock for whoever the game now waits on (cleared at end).
    armTurnDeadline(room);

    // Update seq before CAS write so it gets persisted
    const baseSeq = room.seq;
    room.seq = baseSeq + allEvents.length;

    const ok = await casRoom(room.code, room.version, room);
    if (!ok) continue; // conflict — retry

    // Successful write — broadcast events with sequential seq numbers
    for (let i = 0; i < allEvents.length; i++) {
      await broadcastEvent(room.code, allEvents[i]!, baseSeq + i + 1);
    }
    return NextResponse.json({ ok: true, events: allEvents });
  }
  return NextResponse.json({ ok: false, error: { code: 'conflict', message: 'too many CAS retries' } }, { status: 409 });
}
