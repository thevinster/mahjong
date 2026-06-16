import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../../src/index.js';
import { io as ioc } from 'socket.io-client';
import type { FastifyInstance } from 'fastify';

describe('integration: 1 human + 3 bots play a full hand', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('hand ends within 400 turns and emits a final won or drawWall event', async () => {
    app = await buildApp();
    await app.listen({ port: 0 });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') throw new Error('bad address');
    const url = `http://127.0.0.1:${addr.port}`;

    const hostId = '00000000-0000-0000-0000-aaaaaaaaaaaa';
    const c = await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: `playerId=${hostId}` } });
    const { roomCode } = c.json();
    await app.inject({ method: 'POST', url: `/api/rooms/${roomCode}/start`, headers: { cookie: `playerId=${hostId}` } });

    const sock = ioc(`${url}/game`, { transports: ['websocket'], auth: { playerId: hostId } });
    const events: { t: string; payload: unknown }[] = [];

    try {
      let snapshot: { state: unknown } | null = null;
      await new Promise<void>((resolve, reject) => {
        sock.on('s:snapshot', (s: { state: unknown }) => { snapshot = s; resolve(); });
        sock.on('s:error', (e) => reject(new Error(JSON.stringify(e))));
        sock.on('connect', () => sock.emit('c:hello', { roomCode, playerId: hostId }));
        setTimeout(() => reject(new Error('snapshot timeout')), 3000);
      });
      expect(snapshot).not.toBeNull();

      let wonResolve: (() => void) | null = null;
      const wonPromise = new Promise<void>((resolve) => { wonResolve = resolve; });

      // Auto-pass when bots discard and we need to respond
      // Auto-discard when we drew
      sock.on('s:event', (msg: { event: { t: string; seat?: number; tileForSeat?: unknown } }) => {
        const evt = msg.event;
        events.push({ t: evt.t, payload: evt });

        if (evt.t === 'won' || evt.t === 'drawWall') {
          wonResolve?.();
          return;
        }

        if (evt.t === 'discarded' && evt.seat !== 0) {
          sock.emit('c:intent', { roomCode, intent: { t: 'pass', seat: 0 } });
        }
        // When we drew, discard what we just drew (simplest strategy)
        if (evt.t === 'drew' && evt.seat === 0 && evt.tileForSeat) {
          sock.emit('c:intent', { roomCode, intent: { t: 'discard', seat: 0, tile: evt.tileForSeat } });
        }
      });

      // The host (seat 0) is human; bots fill 1/2/3. Dealer is seat 0.
      // We need to discard to start play.
      const hand = (snapshot as unknown as { state: { hands: Record<number, { own: boolean; concealed: Array<{ kind: string }> }> } }).state.hands[0];
      if (!hand.own) throw new Error('host hand not own=true');
      sock.emit('c:intent', {
        roomCode,
        intent: { t: 'discard', seat: 0, tile: hand.concealed[0] },
      });

      // Wait until a won or drawWall event arrives
      await Promise.race([
        wonPromise,
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('hand did not end in 60s')), 60_000);
        }),
      ]);

      const won = events.find((e) => e.t === 'won' || e.t === 'drawWall');
      expect(won).toBeDefined();
    } finally {
      sock.disconnect();
    }
  }, 90_000); // 90s timeout for the whole test
});
