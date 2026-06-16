import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../src/index.js';
import { io as ioc } from 'socket.io-client';
import type { FastifyInstance } from 'fastify';

describe('socket.io hello → snapshot', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('responds with s:snapshot after a valid c:hello', async () => {
    app = await buildApp();
    await app.listen({ port: 0 });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') throw new Error('bad address');
    const url = `http://127.0.0.1:${addr.port}`;

    // create + start a room as host
    const hostId = 'h0000000-0000-0000-0000-000000000000';
    const c = await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: `playerId=${hostId}` } });
    const { roomCode } = c.json();
    await app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/start`, headers: { cookie: `playerId=${hostId}` } });

    const sock = ioc(`${url}/game`, { transports: ['websocket'] });
    try {
      const snapshot: { state: { viewer: number } } = await new Promise((resolve, reject) => {
        sock.on('s:snapshot', resolve);
        sock.on('s:error', reject);
        sock.on('connect', () => sock.emit('c:hello', { roomCode, playerId: hostId }));
        setTimeout(() => reject(new Error('timeout')), 3000);
      });
      expect(snapshot.state.viewer).toBe(0); // host is seat 0
    } finally {
      sock.disconnect();
    }
  });
});
