import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../src/index.js';
import type { FastifyInstance } from 'fastify';

describe('identity cookie', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it('issues a playerId cookie on first request and reuses it on second', async () => {
    app = await buildApp();
    const r1 = await app.inject({ method: 'GET', url: '/healthz' });
    const setCookie = r1.headers['set-cookie'];
    expect(setCookie).toBeTruthy();
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0]! : setCookie!;
    const match = cookieHeader.match(/playerId=([^;]+)/);
    expect(match).toBeTruthy();
    const id1 = match![1]!;
    expect(id1).toMatch(/^[0-9a-f-]{36}$/);

    const r2 = await app.inject({
      method: 'GET', url: '/healthz',
      headers: { cookie: `playerId=${id1}` },
    });
    // No new cookie issued when one is presented
    expect(r2.headers['set-cookie']).toBeFalsy();
  });
});
