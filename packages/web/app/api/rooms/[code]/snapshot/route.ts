import { NextResponse, type NextRequest } from 'next/server';
import { getOrIssuePlayerId } from '@/lib/identity';
import { getRoom } from '@/lib/rooms';
import { casRoom } from '@/lib/kv';
import { markReconnected } from '@/lib/grace';
import { buildRoomSnapshot } from '@/lib/snapshot';
import type { SnapshotResponse } from '@/lib/protocol';
import type { Seat } from '@mahjong/engine';

export const runtime = 'nodejs';
const SEATS: readonly Seat[] = [0, 1, 2, 3];

export async function GET(_req: NextRequest, ctx: { params: { code: string } }): Promise<NextResponse<SnapshotResponse | { error: string }>> {
  const playerId = getOrIssuePlayerId();
  const room = await getRoom(ctx.params.code);
  if (!room) return NextResponse.json({ error: 'room not found' }, { status: 404 });

  // Self-heal: a viewer actively fetching snapshots is present, so clear any
  // stale "away" flag on their own seat (e.g. a leave-beacon that landed just
  // after a page refresh re-subscribed). Writes only in that rare case.
  for (const s of SEATS) {
    const b = room.seats[s];
    if (b.kind === 'human' && b.playerId === playerId && !b.connected) {
      markReconnected(room, playerId);
      await casRoom(room.code, room.version, room); // best-effort
      break;
    }
  }

  return NextResponse.json(buildRoomSnapshot(room, playerId));
}
