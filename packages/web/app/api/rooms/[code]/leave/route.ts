import { NextResponse, type NextRequest } from 'next/server';
import { getOrIssuePlayerId } from '@/lib/identity';
import { getRoom } from '@/lib/rooms';
import { casRoom } from '@/lib/kv';
import { markDisconnected } from '@/lib/grace';
import { broadcastLobby } from '@/lib/pusher-server';

export const runtime = 'nodejs';
const MAX_RETRIES = 5;

/**
 * Best-effort "I'm gone" signal — sent via navigator.sendBeacon on pagehide.
 * Marks the player's seat disconnected and starts the 60s grace timer; the
 * actual flip to a bot happens lazily in reconcileGrace (see /tick). Always
 * returns 204 — a beacon ignores the response.
 */
export async function POST(_req: NextRequest, ctx: { params: { code: string } }): Promise<NextResponse> {
  const playerId = getOrIssuePlayerId();
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const room = await getRoom(ctx.params.code);
    if (!room) return new NextResponse(null, { status: 204 });
    markDisconnected(room, playerId);
    const ok = await casRoom(room.code, room.version, room);
    if (!ok) continue;
    await broadcastLobby(room.code, room.seq);
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(null, { status: 204 });
}
