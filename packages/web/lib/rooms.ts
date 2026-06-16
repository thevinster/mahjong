import type { GameState, Seat } from '@mahjong/engine';
import { generateRoomCode } from './codes';
import { createRoomIfAbsent, readRoom, casRoom } from './kv';

export type PlayerId = string;

export type SeatBinding =
  | { kind: 'empty' }
  | { kind: 'human'; playerId: PlayerId; displayName: string; connected: boolean; graceExpiresAt?: number }
  | { kind: 'bot';   policyName: string };

export type RoomPhase = 'lobby' | 'playing' | 'ended';

export type Room = {
  code: string;
  createdAt: number;
  host: PlayerId;
  seats: Record<Seat, SeatBinding>;
  state: GameState | null;
  phase: RoomPhase;
  endedAt: number | null;
  seq: number;
  pendingClaims: Record<string, unknown>; // seat-as-string → Intent (JSON-friendly)
  version: number; // bumped on every write; used by casRoom
};

const SEATS: readonly Seat[] = [0, 1, 2, 3];

export async function createRoom(hostPlayerId: PlayerId): Promise<Room> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRoomCode();
    const room: Room = {
      code,
      createdAt: Date.now(),
      host: hostPlayerId,
      seats: {
        0: { kind: 'human', playerId: hostPlayerId, displayName: 'Player 1', connected: true },
        1: { kind: 'empty' },
        2: { kind: 'empty' },
        3: { kind: 'empty' },
      },
      state: null,
      phase: 'lobby',
      endedAt: null,
      seq: 0,
      pendingClaims: {},
      version: 1,
    };
    const ok = await createRoomIfAbsent(code, room);
    if (ok) return room;
  }
  throw new Error('failed to mint a unique room code after 10 attempts');
}

export async function getRoom(code: string): Promise<Room | null> {
  return await readRoom(code);
}

type JoinResult =
  | { ok: true; seat: Seat; room: Room }
  | { ok: false; code: 'no_room' | 'room_full' };

export async function joinAsHuman(code: string, playerId: PlayerId, displayName: string): Promise<JoinResult> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const room = await readRoom(code);
    if (!room) return { ok: false, code: 'no_room' };
    // Idempotent: if already seated, return existing seat
    for (const seat of SEATS) {
      const b = room.seats[seat];
      if (b.kind === 'human' && b.playerId === playerId) {
        b.connected = true;
        const ok = await casRoom(code, room.version, room);
        if (!ok) continue;
        return { ok: true, seat, room };
      }
    }
    // Find first empty
    let targetSeat: Seat | null = null;
    for (const seat of SEATS) {
      if (room.seats[seat].kind === 'empty') { targetSeat = seat; break; }
    }
    if (targetSeat === null) return { ok: false, code: 'room_full' };
    room.seats[targetSeat] = { kind: 'human', playerId, displayName, connected: true };
    const ok = await casRoom(code, room.version, room);
    if (!ok) continue;
    return { ok: true, seat: targetSeat, room };
  }
  // After 5 conflicts, give up
  return { ok: false, code: 'room_full' };
}
