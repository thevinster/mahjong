import type { Event, Intent, RedactedGameState, Seat } from '@mahjong/engine';
import type { SeatBinding } from './rooms.js';

// Client → Server
export type ClientHello  = { roomCode: string; playerId: string };
export type ClientIntent = { roomCode: string; intent: Intent };

// Server → Client
export type ServerSnapshot = { state: RedactedGameState };
export type ServerEvent    = { event: Event; seq: number };
export type ServerLobby    = { seats: Record<Seat, SeatBinding>; host: string };
export type ServerError    = { code: string; message: string };
