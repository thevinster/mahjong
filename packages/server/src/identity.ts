import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import { randomUUID } from 'node:crypto';
import { COOKIE_SECRET, NODE_ENV } from './env.js';

export const PLAYER_COOKIE = 'playerId';

export async function registerIdentity(app: FastifyInstance) {
  await app.register(cookie, { secret: COOKIE_SECRET });
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const existing = req.cookies[PLAYER_COOKIE];
    if (existing) {
      (req as FastifyRequest & { playerId: string }).playerId = existing;
      return;
    }
    const id = randomUUID();
    reply.setCookie(PLAYER_COOKIE, id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 365,
    });
    (req as FastifyRequest & { playerId: string }).playerId = id;
  });
}

export function getPlayerId(req: FastifyRequest): string {
  return (req as FastifyRequest & { playerId: string }).playerId;
}
