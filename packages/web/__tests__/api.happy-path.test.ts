import './kv-mock.js';
import './pusher-mock.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetKvMock } from './kv-mock';
import { resetBroadcasts, getBroadcasts } from './pusher-mock';
import type { NextRequest } from 'next/server';

// Mock next/headers before importing routes
const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined,
    set: (name: string, value: string) => { cookieStore.set(name, value); },
  }),
}));

// Now import route handlers
import { POST as createRoom } from '../app/api/rooms/route.js';
import { POST as startRoom } from '../app/api/rooms/[code]/start/route.js';
import { POST as sendIntent } from '../app/api/rooms/[code]/intent/route.js';
import { GET as getSnapshot } from '../app/api/rooms/[code]/snapshot/route.js';

function mockReq(url: string, body?: unknown): NextRequest {
  return {
    url,
    formData: async () => new FormData(),
    json: async () => body ?? {},
  } as unknown as NextRequest;
}

describe('Full hand via API', () => {
  beforeEach(() => {
    resetKvMock();
    resetBroadcasts();
    cookieStore.clear();
  });

  it('plays a complete hand from creation to end phase', { timeout: 30000 }, async () => {
    // 1. Create room
    const createRes = await createRoom();
    const { roomCode } = await createRes.json();
    expect(roomCode).toMatch(/^[2-9A-Z]{4}$/);

    // 2. Start room (host auto-seated at seat 0)
    const startRes = await startRoom(
      mockReq(`http://localhost/api/rooms/${roomCode}/start`),
      { params: { code: roomCode } }
    );
    expect(startRes.status).toBe(204);

    // 3. Play through the game
    let iterations = 0;
    const MAX_ITERATIONS = 300;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // Fetch current snapshot
      const snapRes = await getSnapshot(
        mockReq(`http://localhost/api/rooms/${roomCode}/snapshot`),
        { params: { code: roomCode } }
      );
      expect(snapRes.status).toBe(200);
      const snap = await snapRes.json();

      // Check if game ended
      if (snap.phase.t === 'ended') {
        break;
      }

      // Handle different phases for viewer (seat 0 = host/human)
      if (snap.phase.t === 'awaitDiscard' && snap.viewer === 0) {
        // It's our turn to discard - discard first tile in hand
        const hand = snap.hands[0];
        if (!hand.own) throw new Error('Expected own hand');
        const tile = hand.concealed[0];
        if (!tile) throw new Error('No tiles in hand');

        const intentRes = await sendIntent(
          mockReq(`http://localhost/api/rooms/${roomCode}/intent`, {
            intent: { t: 'discard', seat: 0, tile },
          }),
          { params: { code: roomCode } }
        );
        expect(intentRes.status).toBe(200);
      } else if (snap.phase.t === 'awaitClaims') {
        // Always pass on claims (for simplicity, human passes)
        // Check if viewer is in the claim phase
        if (snap.viewer === 0) {
          const intentRes = await sendIntent(
            mockReq(`http://localhost/api/rooms/${roomCode}/intent`, {
              intent: { t: 'pass', seat: 0 },
            }),
            { params: { code: roomCode } }
          );
          expect(intentRes.status).toBe(200);
        }
        // If viewer is not 0, bots will handle it inline
      }
      // For other phases (awaitDraw, etc.), bots handle automatically
    }

    // Verify game ended
    const finalSnapRes = await getSnapshot(
      mockReq(`http://localhost/api/rooms/${roomCode}/snapshot`),
      { params: { code: roomCode } }
    );
    const finalSnap = await finalSnapRes.json();
    expect(finalSnap.phase.t).toBe('ended');

    // Verify broadcasts were sent
    const broadcasts = getBroadcasts();
    expect(broadcasts.length).toBeGreaterThan(0);

    console.log(`Game completed in ${iterations} iterations with ${broadcasts.length} broadcasts`);
  });
});
