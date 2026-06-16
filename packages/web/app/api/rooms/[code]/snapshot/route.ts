import { NextResponse, type NextRequest } from 'next/server';
import { getOrIssuePlayerId } from '@/lib/identity';
import { getRoom } from '@/lib/rooms';
import { redactFor, type Seat } from '@mahjong/engine';
import type { SnapshotResponse } from '@/lib/protocol';

export const runtime = 'nodejs';
const SEATS: readonly Seat[] = [0, 1, 2, 3];

export async function GET(_req: NextRequest, ctx: { params: { code: string } }): Promise<NextResponse<SnapshotResponse | { error: string }>> {
  const playerId = getOrIssuePlayerId();
  const room = await getRoom(ctx.params.code);
  if (!room || !room.state) return NextResponse.json({ error: 'not started' }, { status: 404 });
  let mySeat: Seat | null = null;
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind === 'human' && b.playerId === playerId) { mySeat = seat; break; }
  }
  if (mySeat === null) return NextResponse.json({ error: 'not seated' }, { status: 403 });
  return NextResponse.json(redactFor(room.state, mySeat));
}
