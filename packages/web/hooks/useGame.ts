'use client';
import { create } from 'zustand';
import type { Event } from '@mahjong/engine';
import type { RoomSnapshot } from '@/lib/protocol';
import { detectDraw } from '@/lib/detect-draw';

type LogEntry = { id: number; ev: Event };

type GameStore = {
  snapshot: RoomSnapshot | null;
  log: LogEntry[];
  lastSeq: number;      // highest event seq folded into the log (dedup guard)
  snapshotSeq: number;  // seq of the currently-held snapshot (staleness guard)
  recentDrawId: string | null; // id of the viewer's just-drawn tile, held apart until Sort
  setSnapshot: (s: RoomSnapshot) => void;
  applyEvent: (ev: Event, seq: number) => void;
  noteDrawn: (id: string) => void;
  clearRecentDraw: () => void;
  reset: () => void;
};

let nextLogId = 1;

export const useGame = create<GameStore>((set) => ({
  snapshot: null,
  log: [],
  lastSeq: 0,
  snapshotSeq: -1,
  recentDrawId: null,
  setSnapshot(s) {
    // Snapshots can arrive out of order (refetches are fire-and-forget; bot
    // bursts trigger several). `seq` only counts game events, so the whole lobby
    // and the solo lobby→playing edge sit at the same seq. Order by seq, and at
    // equal seq break ties by phase rank so a stale `lobby` can never revert a
    // live `playing`/`ended` board, while forward transitions still apply.
    set((cur) => {
      const accept =
        s.seq > cur.snapshotSeq ||
        (s.seq === cur.snapshotSeq && phaseRank(s.phase) >= phaseRank(cur.snapshot?.phase));
      if (!accept) return cur;
      // Mark the just-drawn tile off the snapshot diff (not the Pusher event) so
      // it's detected on both the realtime push and the polling fallback — i.e.
      // whenever the hand actually grows by a tile. It stays held apart until the
      // player clicks Sort (which calls clearRecentDraw).
      const drawn = detectDraw(cur.snapshot, s);
      return {
        snapshot: s,
        snapshotSeq: s.seq,
        ...(drawn ? { recentDrawId: drawn } : {}),
      };
    });
  },
  applyEvent(ev, seq) {
    set((cur) => {
      if (seq <= cur.lastSeq) return cur; // duplicate / out-of-order
      return { ...cur, lastSeq: seq, log: [...cur.log, { id: nextLogId++, ev }] };
    });
  },
  noteDrawn(id) {
    // The acting player's own draw, read from the intent response — snapshot
    // diffing can't see it (they discard and redraw within one request).
    set({ recentDrawId: id });
  },
  clearRecentDraw() {
    set({ recentDrawId: null });
  },
  reset() {
    set({ snapshot: null, log: [], lastSeq: 0, snapshotSeq: -1, recentDrawId: null });
  },
}));

function phaseRank(p: RoomSnapshot['phase'] | undefined): number {
  return p === 'ended' ? 2 : p === 'playing' ? 1 : p === 'lobby' ? 0 : -1;
}

