import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../../src/index.js';
import { io as ioc } from 'socket.io-client';
import type { FastifyInstance } from 'fastify';

describe('integration: illegal intents get s:error and do not mutate state', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('out-of-turn discard returns s:error with code illegal', async () => {
    app = await buildApp();
    await app.listen({ port: 0 });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') throw new Error('bad address');
    const url = `http://127.0.0.1:${addr.port}`;

    const hostId = '00000000-0000-0000-0000-bbbbbbbbbbbb';
    const c = await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: `playerId=${hostId}` } });
    const { roomCode } = c.json();
    await app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/start`, headers: { cookie: `playerId=${hostId}` } });

    const sock = ioc(`${url}/game`, { transports: ['websocket'], auth: { playerId: hostId } });
    let snap: { state: { hands: Record<number, { concealed?: { kind: string }[] }> } } | null = null;
    await new Promise<void>((resolve, reject) => {
      sock.on('s:snapshot', (s: typeof snap) => { snap = s; resolve(); });
      sock.on('connect', () => sock.emit('c:hello', { roomCode, playerId: hostId }));
      setTimeout(() => reject(new Error('hello timeout')), 3000);
    });

    // Emit a discard intent claiming to be seat 1 (not us - we're seat 0).
    const tile = snap!.state.hands[0]!.concealed![0];
    const errP = new Promise<{ code: string }>((resolve, reject) => {
      sock.on('s:error', resolve);
      setTimeout(() => reject(new Error('no s:error')), 3000);
    });
    sock.emit('c:intent', { roomCode, intent: { t: 'discard', seat: 1, tile } });
    const err = await errP;
    expect(err.code).toMatch(/wrong_seat|illegal/);

    sock.disconnect();
  });
});
