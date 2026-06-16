import { NextResponse, type NextRequest } from 'next/server';
import { getOrIssuePlayerId } from '@/lib/identity';
import { joinAsHuman, getRoom } from '@/lib/rooms';
import { reconcileGrace } from '@/lib/grace';
import type { JoinRoomRequest, JoinRoomResponse } from '@/lib/protocol';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: { code: string } }): Promise<NextResponse<JoinRoomResponse | { error: string }>> {
  const playerId = getOrIssuePlayerId();
  const body: JoinRoomRequest = await req.json().catch(() => ({ displayName: 'Player' }));
  const displayName = body.displayName?.trim() || 'Player';
  // First, reconcile grace on any expired seat (cleans up old players)
  const room = await getRoom(ctx.params.code);
  if (room) reconcileGrace(room);
  const result = await joinAsHuman(ctx.params.code, playerId, displayName);
  if (!result.ok) {
    if (result.code === 'no_room')   return NextResponse.json({ error: 'room not found' }, { status: 404 });
    if (result.code === 'room_full') return NextResponse.json({ error: 'room is full' },   { status: 409 });
    return NextResponse.json({ error: 'join failed' }, { status: 400 });
  }
  return NextResponse.json({ seat: result.seat });
}
