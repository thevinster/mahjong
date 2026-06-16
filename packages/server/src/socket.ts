import type { Server as IOServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { RoomRegistry } from './rooms.js';
import type { ClientHello, ClientIntent } from './protocol.js';
import { gameRoom, playerRoom, sendSnapshot, broadcastEvent } from './redact.js';
import type { Seat } from '@mahjong/engine';
import { applyIntent } from './dispatcher.js';

const SEATS: readonly Seat[] = [0, 1, 2, 3];

export function attachSocketIo(httpServer: HttpServer, rooms: RoomRegistry): IOServer {
  const io = new Server(httpServer, { cors: { origin: true, credentials: true } });
  const ns = io.of('/game');

  ns.on('connection', (socket) => {
    socket.on('c:hello', (msg: ClientHello) => {
      const room = rooms.get(msg.roomCode);
      if (!room) {
        socket.emit('s:error', { code: 'no_room', message: 'room not found' });
        return;
      }
      const seat = findSeat(room, msg.playerId);
      if (seat === null) {
        socket.emit('s:error', { code: 'not_seated', message: 'not seated in this room' });
        return;
      }
      socket.join(gameRoom(room.code));
      socket.join(playerRoom(msg.playerId));
      sendSnapshot(io, room, msg.playerId, seat);
    });

    socket.on('c:intent', (msg: ClientIntent) => {
      const room = rooms.get(msg.roomCode);
      if (!room) return socket.emit('s:error', { code: 'no_room', message: 'room not found' });
      const playerId = socket.handshake.auth?.playerId
        ?? extractPlayerIdFromCookie(socket.handshake.headers.cookie);
      const seat = findSeat(room, playerId ?? '');
      if (seat === null) return socket.emit('s:error', { code: 'not_seated', message: 'not seated' });
      const result = applyIntent(room, seat, msg.intent);
      if (!result.ok) return socket.emit('s:error', { code: result.code, message: result.message });
      for (const ev of result.events) broadcastEvent(io, room, ev);
    });
  });

  return io;
}

function findSeat(room: ReturnType<RoomRegistry['get']> & object, playerId: string): Seat | null {
  for (const seat of SEATS) {
    const b = room.seats[seat];
    if (b.kind === 'human' && b.playerId === playerId) return seat;
  }
  return null;
}

function extractPlayerIdFromCookie(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const m = cookie.match(/playerId=([^;]+)/);
  return m ? m[1]! : null;
}
