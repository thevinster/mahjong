import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoomSync } from '../lib/room-sync';

describe('createRoomSync — live-update fallback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('refetches once immediately, then polls on the interval so other clients converge without a manual refresh', () => {
    const refetch = vi.fn();
    const sync = createRoomSync({ refetch, pollMs: 3000, subscribe: () => ({ unsubscribe: () => {} }) });

    sync.start();
    expect(refetch).toHaveBeenCalledTimes(1); // instant initial load

    vi.advanceTimersByTime(3000);
    expect(refetch).toHaveBeenCalledTimes(2); // first poll

    vi.advanceTimersByTime(6000);
    expect(refetch).toHaveBeenCalledTimes(4); // two further polls

    sync.stop();
    vi.advanceTimersByTime(9000);
    expect(refetch).toHaveBeenCalledTimes(4); // stopped — polling halts
  });

  it('keeps polling even when the realtime subscription throws (e.g. Pusher misconfigured/over quota)', () => {
    const refetch = vi.fn();
    const sync = createRoomSync({
      refetch,
      pollMs: 3000,
      subscribe: () => { throw new Error('NEXT_PUBLIC_PUSHER_KEY / CLUSTER missing'); },
    });

    expect(() => sync.start()).not.toThrow(); // a dead realtime layer must not kill sync
    expect(refetch).toHaveBeenCalledTimes(1); // initial load still happened

    vi.advanceTimersByTime(6000);
    expect(refetch).toHaveBeenCalledTimes(3); // polling carries the updates
  });

  it('unsubscribes the realtime subscription on stop()', () => {
    const unsubscribe = vi.fn();
    const sync = createRoomSync({ refetch: vi.fn(), pollMs: 3000, subscribe: () => ({ unsubscribe }) });

    sync.start();
    sync.stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
