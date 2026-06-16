import { NextResponse } from 'next/server';
import { getOrIssuePlayerId } from '@/lib/identity';
import { createRoom } from '@/lib/rooms';
import type { CreateRoomResponse } from '@/lib/protocol';

export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse<CreateRoomResponse>> {
  const playerId = getOrIssuePlayerId();
  const room = await createRoom(playerId);
  return NextResponse.json({ roomCode: room.code, playerId });
}
