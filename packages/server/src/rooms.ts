import type { GameState, BotPolicy, Seat } from '@mahjong/engine';
import { generateRoomCode } from './codes.js';
import { PromiseQueue } from './locks.js';

export type PlayerId = string;

export type SeatBinding =
  | { kind: 'empty' }
  | { kind: 'human'; playerId: PlayerId; displayName: string; connected: boolean }
  | { kind: 'bot';   policyName: string };

export type RoomPhase = 'lobby' | 'playing' | 'ended';

export type Room = {
  readonly code: string;
  readonly createdAt: number;
  readonly host: PlayerId;
  seats: Record<Seat, SeatBinding>;
  state: GameState | null;
  policies: Record<Seat, BotPolicy | null>;
  graceTimers: Record<Seat, NodeJS.Timeout | null>;
  phase: RoomPhase;
  endedAt: number | null;
  /** monotonic per-room event sequence number for s:event */
  seq: number;
  /** seat -> latest pending intent during awaitClaims (claim or pass) */
  pendingClaims: Map<Seat, unknown>;
  /** Serializes all writes to room.state — see locks.ts. */
  lock: PromiseQueue;
};

export class RoomRegistry {
  private rooms = new Map<string, Room>();

  create(hostPlayerId: PlayerId): Room {
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();
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
      policies: { 0: null, 1: null, 2: null, 3: null },
      graceTimers: { 0: null, 1: null, 2: null, 3: null },
      phase: 'lobby',
      endedAt: null,
      seq: 0,
      pendingClaims: new Map(),
      lock: new PromiseQueue(),
    };
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /**
   * Place a human in the first empty seat. Idempotent: if the playerId is
   * already seated, returns the existing seat without modification.
   * Throws if room is full and player isn't already in it.
   */
  joinAsHuman(code: string, playerId: PlayerId, displayName: string): Seat {
    const room = this.rooms.get(code);
    if (!room) throw new Error(`room ${code} not found`);
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const b = room.seats[seat];
      if (b.kind === 'human' && b.playerId === playerId) {
        b.connected = true;
        return seat;
      }
    }
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const b = room.seats[seat];
      if (b.kind === 'empty') {
        room.seats[seat] = { kind: 'human', playerId, displayName, connected: true };
        return seat;
      }
    }
    throw new Error(`room ${code} is full`);
  }

  reap(code: string): void {
    const room = this.rooms.get(code);
    if (room) {
      for (const seat of [0, 1, 2, 3] as Seat[]) {
        const t = room.graceTimers[seat];
        if (t) clearTimeout(t);
      }
    }
    this.rooms.delete(code);
  }

  size(): number { return this.rooms.size; }
}
