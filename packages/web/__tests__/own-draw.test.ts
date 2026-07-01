import { describe, it, expect } from 'vitest';
import { ownDrawFromEvents } from '../lib/detect-draw';
import type { Event, Tile } from '@mahjong/engine';

const p5: Tile = { kind: 'suit', suit: 'p', rank: 5 };
const m1: Tile = { kind: 'suit', suit: 'm', rank: 1 };

describe('ownDrawFromEvents — the viewer\'s own freshly drawn tile (from the intent response)', () => {
  it('returns the viewer\'s drawn tile id, ignoring redacted/other-seat draws', () => {
    const events: Event[] = [
      { t: 'discarded', seat: 0, tile: { kind: 'honor', honor: 'E' } },
      { t: 'drew', seat: 1 },                       // another seat, redacted (no tileForSeat)
      { t: 'drew', seat: 0, tileForSeat: p5 },      // the viewer's own draw
    ];
    expect(ownDrawFromEvents(events, 0)).toBe('p5');
  });

  it('returns the LAST own draw when there are several', () => {
    const events: Event[] = [
      { t: 'drew', seat: 0, tileForSeat: m1 },
      { t: 'drew', seat: 0, tileForSeat: p5 },
    ];
    expect(ownDrawFromEvents(events, 0)).toBe('p5');
  });

  it('returns null when another seat drew but the viewer did not', () => {
    expect(ownDrawFromEvents([{ t: 'drew', seat: 1, tileForSeat: p5 }] as Event[], 0)).toBeNull();
  });

  it('returns null when there is no draw in the events', () => {
    expect(ownDrawFromEvents([{ t: 'discarded', seat: 0, tile: p5 }] as Event[], 0)).toBeNull();
  });

  it('returns null for a spectator (no seat)', () => {
    expect(ownDrawFromEvents([{ t: 'drew', seat: 0, tileForSeat: p5 }] as Event[], null)).toBeNull();
  });
});
