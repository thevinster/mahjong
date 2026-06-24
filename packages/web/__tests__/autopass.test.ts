import './kv-mock.js';
import './pusher-mock.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetKvMock } from './kv-mock';
import { resetBroadcasts } from './pusher-mock';
import { viewerLegalIntents } from '../lib/client-legal';
import type { NextRequest } from 'next/server';

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => { cookieStore.set(name, value); },
  }),
}));

import { POST as createRoom } from '../app/api/rooms/route.js';
import { POST as startRoom } from '../app/api/rooms/[code]/start/route.js';
import { POST as sendIntent } from '../app/api/rooms/[code]/intent/route.js';
import { GET as getSnapshot } from '../app/api/rooms/[code]/snapshot/route.js';

function mockReq(url: string, body?: unknown): NextRequest {
  return { url, formData: async () => new FormData(), json: async () => body ?? {} } as unknown as NextRequest;
}

describe('bot autoplay', () => {
  beforeEach(() => {
    resetKvMock();
    resetBroadcasts();
    cookieStore.clear();
  });

  it('never asks the human to pass when they have no claim — bots advance until a real action', { timeout: 30000 }, async () => {
    cookieStore.set('playerId', 'hostA');
    const { roomCode } = await (await createRoom()).json();
    await startRoom(mockReq(`http://localhost/api/rooms/${roomCode}/start`), { params: { code: roomCode } });

    const snap = () => getSnapshot(mockReq(`http://localhost/api/rooms/${roomCode}/snapshot`), { params: { code: roomCode } }).then((r) => r.json());
    const send = (intent: unknown) =>
      sendIntent(mockReq(`http://localhost/api/rooms/${roomCode}/intent`, { intent }), { params: { code: roomCode } });

    let ended = false;
    let sawClaimPrompt = 0;
    for (let i = 0; i < 400 && !ended; i++) {
      const s = await snap();
      if (s.state.phase.t === 'ended') { ended = true; break; }

      if (s.state.phase.t === 'awaitDiscard' && s.viewerSeat === 0) {
        await send({ t: 'discard', seat: 0, tile: s.state.hands[0].concealed[0] });
      } else if (s.state.phase.t === 'awaitClaims' && s.viewerSeat === 0) {
        // The server should only ever stop on the human in awaitClaims when they
        // actually have a claim. A pass-only prompt means autoplay is broken.
        const legal = viewerLegalIntents(s.state);
        const claims = legal.filter((x) => x.t !== 'pass');
        expect(claims.length).toBeGreaterThan(0);
        sawClaimPrompt++;
        await send({ t: 'pass', seat: 0 });
      } else {
        // Any state that needs no human action should have been advanced by the
        // server before returning. Reaching here means the game stalled.
        throw new Error(`stalled: phase=${s.state.phase.t} viewerSeat=${s.viewerSeat}`);
      }
    }

    expect(ended).toBe(true);
    void sawClaimPrompt;
  });
});
