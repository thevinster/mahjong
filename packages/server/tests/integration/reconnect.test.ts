import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../../src/index.js';
import { io as ioc } from 'socket.io-client';
import type { FastifyInstance } from 'fastify';

describe('integration: disconnect and reconnect within grace window', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('reconnect within 60s preserves the seat (still human, not bot)', async () => {
    app = await buildApp();
    await app.listen({ port: 0 });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') throw new Error('bad address');
    const url = `http://127.0.0.1:${addr.port}`;

    const hostId = '00000000-0000-0000-0000-aaaaaaaaaaaa';
    const c = await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: `playerId=${hostId}` } });
    const { roomCode } = c.json();
    await app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/start`, headers: { cookie: `playerId=${hostId}` } });

    const sock1 = ioc(`${url}/game`, { transports: ['websocket'], auth: { playerId: hostId } });
    await new Promise<void>((resolve, reject) => {
      sock1.on('s:snapshot', () => resolve());
      sock1.on('s:error', (e) => reject(new Error(JSON.stringify(e))));
      sock1.on('connect', () => sock1.emit('c:hello', { roomCode, playerId: hostId }));
      setTimeout(() => reject(new Error('hello timeout')), 3000);
    });
    sock1.disconnect();

    // Server has armed a 60s grace timer; reconnect quickly
    await new Promise((r) => setTimeout(r, 200));

    const sock2 = ioc(`${url}/game`, { transports: ['websocket'], auth: { playerId: hostId } });
    await new Promise<void>((resolve, reject) => {
      sock2.on('s:snapshot', () => resolve());
      sock2.on('s:error', (e) => reject(new Error(JSON.stringify(e))));
      sock2.on('connect', () => sock2.emit('c:hello', { roomCode, playerId: hostId }));
      setTimeout(() => reject(new Error('hello timeout')), 3000);
    });

    const rooms = (app as unknown as { rooms: import('../../src/rooms.js').RoomRegistry }).rooms;
    const room = rooms.get(roomCode)!;
    expect(room.seats[0].kind).toBe('human');
    if (room.seats[0].kind === 'human') {
      expect(room.seats[0].connected).toBe(true);
    }
    sock2.disconnect();
  });
});
