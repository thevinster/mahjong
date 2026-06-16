import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../src/index.js';
import type { FastifyInstance } from 'fastify';

describe('REST: POST /api/rooms', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('creates a room and returns roomCode + playerId', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/rooms' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.roomCode).toMatch(/^[0-9A-Z]{4}$/);
    expect(body.playerId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('uses the playerId from cookie when present', async () => {
    app = await buildApp();
    const fixedId = '11111111-1111-1111-1111-111111111111';
    const res = await app.inject({
      method: 'POST', url: '/api/rooms',
      headers: { cookie: `playerId=${fixedId}` },
    });
    expect(res.json().playerId).toBe(fixedId);
  });
});
