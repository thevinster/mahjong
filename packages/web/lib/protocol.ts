import type { Event, Intent, RedactedGameState, Seat } from '@mahjong/engine';
import type { RoomPhase, SeatBinding } from './rooms';

export type CreateRoomResponse   = { roomCode: string; playerId: string };
export type JoinRoomRequest      = { displayName: string };
export type JoinRoomResponse     = { seat: Seat };
export type IntentRequest        = { intent: Intent };
export type IntentResponse       = { ok: boolean; events?: Event[]; error?: { code: string; message: string } };
export type LobbyState           = { seats: Record<Seat, SeatBinding>; host: string };

/** A single seat as exposed to clients — never carries a playerId. */
export type SeatPublic = {
  seat: Seat;
  kind: 'empty' | 'human' | 'bot';
  name: string | null;   // displayName for humans, 'Bot' for bots, null for empty
  connected: boolean;    // humans only; bots/empty are always false
};

/**
 * The single payload the room page renders, in both lobby and game. `state` is
 * the per-seat redacted game state, present only once a hand is running AND the
 * viewer occupies a seat. `seq` lets the client ignore stale snapshots.
 */
export type RoomSnapshot = {
  code: string;
  phase: RoomPhase;
  viewerSeat: Seat | null;
  isHost: boolean;
  seq: number;
  seats: SeatPublic[];
  state: RedactedGameState | null;
};
export type SnapshotResponse     = RoomSnapshot;
