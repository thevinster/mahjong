import type { Event, Intent, RedactedGameState, Seat } from '@mahjong/engine';
import type { SeatBinding } from './rooms.js';

export type CreateRoomResponse   = { roomCode: string; playerId: string };
export type JoinRoomRequest      = { displayName: string };
export type JoinRoomResponse     = { seat: Seat };
export type IntentRequest        = { intent: Intent };
export type IntentResponse       = { ok: boolean; events?: Event[]; error?: { code: string; message: string } };
export type SnapshotResponse     = RedactedGameState;
export type LobbyState           = { seats: Record<Seat, SeatBinding>; host: string };
