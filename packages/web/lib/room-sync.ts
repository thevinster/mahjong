/**
 * Keeps a client converged with the server's room snapshot.
 *
 * Two independent paths, by design:
 *  - **Realtime (fast path):** a Pusher subscription that refetches on each push.
 *    This is best-effort — it can fail to connect (missing `NEXT_PUBLIC_*` at
 *    build, the free-tier connection cap, a blocked WebSocket, a transient drop)
 *    and when it does, it must NOT take the rest of sync down with it.
 *  - **Polling (safety net):** an interval that refetches the snapshot regardless
 *    of realtime health. This guarantees every client — not just the one taking
 *    an action — converges within a few seconds without a manual page refresh.
 *
 * Pure and React-free so it can be unit-tested with fake timers; `usePusherRoom`
 * is a thin wrapper that supplies the real refetch + Pusher subscription.
 */
export type RoomSubscription = { unsubscribe: () => void };

export type RoomSyncDeps = {
  /** Fetch the latest snapshot and push it into the store. */
  refetch: () => void;
  /** Wire up the realtime fast path. May throw or return null; sync survives either. */
  subscribe?: () => RoomSubscription | null;
  /** Polling cadence for the safety net (ms). */
  pollMs?: number;
};

export const DEFAULT_POLL_MS = 2500;

export type RoomSync = { start: () => void; stop: () => void };

export function createRoomSync(deps: RoomSyncDeps): RoomSync {
  const pollMs = deps.pollMs ?? DEFAULT_POLL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;
  let sub: RoomSubscription | null = null;
  let started = false;

  return {
    start() {
      if (started) return;
      started = true;

      deps.refetch(); // instant initial load

      // Best-effort realtime. A dead realtime layer must never stop polling.
      try {
        sub = deps.subscribe?.() ?? null;
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.warn('[room-sync] realtime unavailable, falling back to polling:', err);
        }
        sub = null;
      }

      // Safety net: converge every client even if realtime delivers nothing.
      timer = setInterval(() => deps.refetch(), pollMs);
    },

    stop() {
      started = false;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      if (sub) {
        try { sub.unsubscribe(); } catch { /* ignore */ }
        sub = null;
      }
    },
  };
}
