import type { FastifyInstance } from 'fastify';
import { getPlayerId } from './identity.js';
import { RoomRegistry } from './rooms.js';
import {
  initialState, seededRng, heuristicPolicy, type Seat,
} from '@mahjong/engine';
import { randomBytes } from 'node:crypto';

export function registerRest(app: FastifyInstance, rooms: RoomRegistry) {
  app.post('/api/rooms', async (req) => {
    const playerId = getPlayerId(req);
    const room = rooms.create(playerId);
    return { roomCode: room.code, playerId };
  });

  app.post<{ Params: { code: string }; Body: { displayName: string } }>(
    '/api/rooms/:code/join',
    async (req, reply) => {
      const room = rooms.get(req.params.code);
      if (!room) return reply.code(404).send({ error: 'room not found' });
      const playerId = getPlayerId(req);
      const displayName = req.body?.displayName?.trim() || 'Player';
      try {
        const seat = rooms.joinAsHuman(room.code, playerId, displayName);
        return { seat };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'join failed';
        if (/full/i.test(msg)) return reply.code(409).send({ error: msg });
        return reply.code(400).send({ error: msg });
      }
    },
  );

  app.post<{ Params: { code: string } }>(
    '/api/rooms/:code/start',
    async (req, reply) => {
      const room = rooms.get(req.params.code);
      if (!room) return reply.code(404).send({ error: 'room not found' });
      const playerId = getPlayerId(req);
      if (room.host !== playerId) return reply.code(403).send({ error: 'host only' });
      if (room.phase !== 'lobby') return reply.code(409).send({ error: 'already started' });

      for (const seat of [0, 1, 2, 3] as Seat[]) {
        if (room.seats[seat].kind === 'empty') {
          room.seats[seat] = { kind: 'bot', policyName: heuristicPolicy.name };
          room.policies[seat] = heuristicPolicy;
        }
      }
      const seed = randomBytes(4).readUInt32BE(0);
      room.state = initialState(seededRng(seed));
      room.phase = 'playing';
      const io = (req.server as unknown as { io?: import('socket.io').Server }).io;
      if (io) {
        void room.lock.enqueue(async () => {
          const { maybeRunBotTurns } = await import('./bot-scheduler.js');
          await maybeRunBotTurns(io, room);
        });
      }
      return reply.code(204).send();
    },
  );
}
