import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getOrIssuePlayerId } from '@/lib/identity';
import { getRoom, canStartHand } from '@/lib/rooms';
import { casRoom } from '@/lib/kv';
import { initialState, seededRng, heuristicPolicy, type Seat } from '@mahjong/engine';
import { runBotTurnsInline, armTurnDeadline } from '@/lib/bot-scheduler';
import { broadcastEvent, broadcastLobby } from '@/lib/pusher-server';

export const runtime = 'nodejs';
const SEATS: readonly Seat[] = [0, 1, 2, 3];

export async function POST(_req: NextRequest, ctx: { params: { code: string } }): Promise<NextResponse> {
  const playerId = getOrIssuePlayerId();
  for (let attempt = 0; attempt < 5; attempt++) {
    const room = await getRoom(ctx.params.code);
    if (!room) return NextResponse.json({ error: 'room not found' }, { status: 404 });
    if (room.host !== playerId) return NextResponse.json({ error: 'host only' }, { status: 403 });
    // Startable from the lobby, or as a NEW hand once the previous one has ended.
    if (!canStartHand(room)) return NextResponse.json({ error: 'hand in progress' }, { status: 409 });
    for (const seat of SEATS) {
      if (room.seats[seat].kind === 'empty') {
        room.seats[seat] = { kind: 'bot', policyName: heuristicPolicy.name };
      }
    }
    const seed = randomBytes(4).readUInt32BE(0);
    room.state = initialState(seededRng(seed));
    room.phase = 'playing';
    room.pendingClaims = {}; // clear any leftover claims from the previous hand
    // Run any leading bot turns synchronously (host is always seat 0 / human, so this is usually a no-op)
    const events = runBotTurnsInline(room);
    armTurnDeadline(room);

    // Update seq before CAS write so it gets persisted
    const baseSeq = room.seq;
    room.seq = baseSeq + events.length;

    const ok = await casRoom(room.code, room.version, room);
    if (!ok) continue;

    // Broadcast events after successful write with sequential seq numbers
    for (let i = 0; i < events.length; i++) {
      await broadcastEvent(room.code, events[i]!, baseSeq + i + 1);
    }
    // Always signal the start so lobby clients transition into the hand, even
    // when there were no leading bot events (the human dealer acts first).
    await broadcastLobby(room.code, room.seq);
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json({ error: 'conflict' }, { status: 409 });
}
