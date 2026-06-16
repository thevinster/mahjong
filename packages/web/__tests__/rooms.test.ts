import './kv-mock.js'; // must be first import
import { describe, it, expect, beforeEach } from 'vitest';
import { resetKvMock } from './kv-mock';
import { createRoom, getRoom, joinAsHuman } from '../lib/rooms';

describe('KV-backed RoomRegistry', () => {
  beforeEach(() => resetKvMock());

  it('createRoom: returns a unique 4-char code and stores the room', async () => {
    const room = await createRoom('player-1');
    expect(room.code).toMatch(/^[2-9A-Z]{4}$/);
    expect(room.host).toBe('player-1');
    const re = await getRoom(room.code);
    expect(re?.code).toBe(room.code);
  });

  it('joinAsHuman: places player in seat 1 when room has just the host', async () => {
    const room = await createRoom('host');
    const result = await joinAsHuman(room.code, 'guest', 'Alice');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.seat).toBe(1);
      const re = await getRoom(room.code);
      expect(re?.seats[1].kind).toBe('human');
    }
  });

  it('joinAsHuman: rejects when full', async () => {
    const room = await createRoom('host');
    await joinAsHuman(room.code, 'g1', 'A');
    await joinAsHuman(room.code, 'g2', 'B');
    await joinAsHuman(room.code, 'g3', 'C');
    const r = await joinAsHuman(room.code, 'g4', 'D');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('room_full');
  });
});
