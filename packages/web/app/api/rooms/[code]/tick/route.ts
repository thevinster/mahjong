import { NextResponse, type NextRequest } from 'next/server';
import { getRoom } from '@/lib/rooms';
import { casRoom } from '@/lib/kv';
import { reconcileGrace } from '@/lib/grace';
import { runBotTurnsInline, reconcileTurnTimeout, armTurnDeadline } from '@/lib/bot-scheduler';
import { broadcastEvent, broadcastLobby } from '@/lib/pusher-server';

export const runtime = 'nodejs';
const MAX_RETRIES = 5;

/**
 * Serverless has no background timers, so clients nudge the room when the seat
 * on turn belongs to a disconnected human. This:
 *   1. flips any grace-expired disconnected humans to bots (reconcileGrace), then
 *   2. runs any now-pending bot turns (runBotTurnsInline).
 * It's a cheap no-op (204) when nothing changed, so it's safe to poll.
 */
export async function POST(_req: NextRequest, ctx: { params: { code: string } }): Promise<NextResponse> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const room = await getRoom(ctx.params.code);
    if (!room) return NextResponse.json({ error: 'room not found' }, { status: 404 });

    // A no-show past the per-turn deadline counts as a drop → bot, same as an
    // explicit disconnect whose grace expired.
    const timedOut = reconcileTurnTimeout(room);
    const flipped = reconcileGrace(room);
    const events = runBotTurnsInline(room);
    if (!timedOut && !flipped && events.length === 0) {
      return new NextResponse(null, { status: 204 }); // nothing to advance
    }
    // Something advanced — re-arm the clock for whoever is now on turn.
    armTurnDeadline(room);

    const baseSeq = room.seq;
    room.seq = baseSeq + events.length;
    const ok = await casRoom(room.code, room.version, room);
    if (!ok) continue; // someone else wrote first — re-read and retry

    for (let i = 0; i < events.length; i++) {
      await broadcastEvent(room.code, events[i]!, baseSeq + i + 1);
    }
    await broadcastLobby(room.code, room.seq);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'conflict' }, { status: 409 });
}
