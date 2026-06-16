import { NextResponse, type NextRequest } from 'next/server';
import { getOrIssuePlayerId } from '@/lib/identity';
import { getRoom } from '@/lib/rooms';
import { reconcileGrace, markReconnected } from '@/lib/grace';
import { authenticateChannel } from '@/lib/pusher-server';
import { casRoom } from '@/lib/kv';
import type { Seat } from '@mahjong/engine';

export const runtime = 'nodejs';
const SEATS: readonly Seat[] = [0, 1, 2, 3];

export async function POST(req: NextRequest): Promise<NextResponse> {
  const form = await req.formData();
  const socketId = form.get('socket_id')?.toString() ?? '';
  const channel = form.get('channel_name')?.toString() ?? '';
  if (!socketId || !channel) {
    return NextResponse.json({ error: 'missing socket_id or channel_name' }, { status: 400 });
  }

  const playerId = getOrIssuePlayerId();

  // Channel format: private-room-XYZW   or   private-room-XYZW-seat-N
  const m = channel.match(/^private-room-([0-9A-Z]{4})(?:-seat-(\d))?$/);
  if (!m) return NextResponse.json({ error: 'bad channel' }, { status: 400 });
  const code = m[1]!;
  const requestedSeat = m[2] !== undefined ? (Number(m[2]) as Seat) : null;

  const room = await getRoom(code);
  if (!room) return NextResponse.json({ error: 'no room' }, { status: 404 });

  reconcileGrace(room);

  let mySeat: Seat | null = null;
  for (const s of SEATS) {
    const b = room.seats[s];
    if (b.kind === 'human' && b.playerId === playerId) { mySeat = s; break; }
  }
  if (mySeat === null) return NextResponse.json({ error: 'not seated' }, { status: 403 });

  // Seat-private channel — only the owner of the seat can subscribe
  if (requestedSeat !== null && requestedSeat !== mySeat) {
    return NextResponse.json({ error: 'wrong seat' }, { status: 403 });
  }

  // Subscription is effectively a reconnect — clear grace timer
  markReconnected(room, playerId);
  await casRoom(code, room.version, room); // best effort

  const auth = authenticateChannel(socketId, channel, playerId);
  return NextResponse.json({ auth });
}
