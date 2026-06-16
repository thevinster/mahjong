import { describe, it, expect } from 'vitest';
import { RoomRegistry } from '../src/rooms.js';

describe('RoomRegistry', () => {
  it('create() returns a Room with a unique code and host playerId set', () => {
    const reg = new RoomRegistry();
    const r1 = reg.create('p1');
    const r2 = reg.create('p2');
    expect(r1.code).not.toBe(r2.code);
    expect(r1.host).toBe('p1');
    expect(r2.host).toBe('p2');
  });

  it('get() returns a created room and undefined for unknown code', () => {
    const reg = new RoomRegistry();
    const r = reg.create('p1');
    expect(reg.get(r.code)).toBe(r);
    expect(reg.get('ZZZZ')).toBeUndefined();
  });

  it('initializes seats with seat 0 = host (human), others = empty', () => {
    const reg = new RoomRegistry();
    const r = reg.create('p1');
    expect(r.seats[0]).toEqual({ kind: 'human', playerId: 'p1', displayName: 'Player 1', connected: true });
    expect(r.seats[1]).toEqual({ kind: 'empty' });
    expect(r.seats[2]).toEqual({ kind: 'empty' });
    expect(r.seats[3]).toEqual({ kind: 'empty' });
  });

  it('joinAsHuman() places the player in the first empty seat', () => {
    const reg = new RoomRegistry();
    const r = reg.create('p1');
    const seat = reg.joinAsHuman(r.code, 'p2', 'Alice');
    expect(seat).toBe(1);
    expect(r.seats[1]).toEqual({ kind: 'human', playerId: 'p2', displayName: 'Alice', connected: true });
  });

  it('joinAsHuman() rejects when room full', () => {
    const reg = new RoomRegistry();
    const r = reg.create('p1');
    reg.joinAsHuman(r.code, 'p2', 'A');
    reg.joinAsHuman(r.code, 'p3', 'B');
    reg.joinAsHuman(r.code, 'p4', 'C');
    expect(() => reg.joinAsHuman(r.code, 'p5', 'D')).toThrow(/full/i);
  });

  it('joinAsHuman() rejects re-join with different name (same playerId returns existing seat)', () => {
    const reg = new RoomRegistry();
    const r = reg.create('p1');
    reg.joinAsHuman(r.code, 'p2', 'Alice');
    const seatAgain = reg.joinAsHuman(r.code, 'p2', 'Alice'); // idempotent
    expect(seatAgain).toBe(1);
  });

  it('reap() removes the room', () => {
    const reg = new RoomRegistry();
    const r = reg.create('p1');
    reg.reap(r.code);
    expect(reg.get(r.code)).toBeUndefined();
  });
});
