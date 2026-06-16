import type { FastifyInstance } from 'fastify';
import { getPlayerId } from './identity.js';
import { RoomRegistry } from './rooms.js';

export function registerRest(app: FastifyInstance, rooms: RoomRegistry) {
  app.post('/api/rooms', async (req) => {
    const playerId = getPlayerId(req);
    const room = rooms.create(playerId);
    return { roomCode: room.code, playerId };
  });
}
