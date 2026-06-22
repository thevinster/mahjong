import './pusher-mock.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { resetBroadcasts, getBroadcasts } from './pusher-mock';
import { broadcastEvent } from '../lib/pusher-server';

describe('broadcastEvent redaction', () => {
  beforeEach(() => resetBroadcasts());

  it('keeps a flower replacement private to the drawing seat', async () => {
    await broadcastEvent(
      'ABCD',
      { t: 'flowerReplaced', seat: 2, flower: { kind: 'flower', flower: 'F1' }, replacement: { kind: 'suit', suit: 'm', rank: 5 } },
      7,
    );
    const room = getBroadcasts().find((b) => b.channel === 'private-room-ABCD');
    const seat = getBroadcasts().find((b) => b.channel === 'private-room-ABCD-seat-2');
    expect(seat).toBeTruthy();
    expect(JSON.stringify(seat!.data)).toContain('replacement'); // owner sees their draw
    expect(room).toBeTruthy();
    expect(JSON.stringify(room!.data)).not.toContain('replacement'); // others must not
    expect(JSON.stringify(room!.data)).toContain('flowerReplaced');
  });

  it('still keeps a drawn tile private to the drawing seat (regression)', async () => {
    await broadcastEvent('ABCD', { t: 'drew', seat: 1, tileForSeat: { kind: 'suit', suit: 'p', rank: 3 } }, 8);
    const room = getBroadcasts().find((b) => b.channel === 'private-room-ABCD' && (b.data as { seq: number }).seq === 8);
    const seat = getBroadcasts().find((b) => b.channel === 'private-room-ABCD-seat-1');
    expect(JSON.stringify(seat!.data)).toContain('tileForSeat');
    expect(JSON.stringify(room!.data)).not.toContain('tileForSeat');
  });
});
