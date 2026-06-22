'use client';
import { create } from 'zustand';
import type { Event } from '@mahjong/engine';
import type { RoomSnapshot } from '@/lib/protocol';

type LogEntry = { id: number; ev: Event };

type GameStore = {
  snapshot: RoomSnapshot | null;
  log: LogEntry[];
  lastSeq: number;      // highest event seq folded into the log (dedup guard)
  snapshotSeq: number;  // seq of the currently-held snapshot (staleness guard)
  setSnapshot: (s: RoomSnapshot) => void;
  applyEvent: (ev: Event, seq: number) => void;
  reset: () => void;
};

let nextLogId = 1;

export const useGame = create<GameStore>((set) => ({
  snapshot: null,
  log: [],
  lastSeq: 0,
  snapshotSeq: -1,
  setSnapshot(s) {
    // Snapshots can arrive out of order (refetches are fire-and-forget; bot
    // bursts trigger several). `seq` only counts game events, so the whole lobby
    // and the solo lobby→playing edge sit at the same seq. Order by seq, and at
    // equal seq break ties by phase rank so a stale `lobby` can never revert a
    // live `playing`/`ended` board, while forward transitions still apply.
    set((cur) => {
      if (s.seq > cur.snapshotSeq) return { snapshot: s, snapshotSeq: s.seq };
      if (s.seq === cur.snapshotSeq && phaseRank(s.phase) >= phaseRank(cur.snapshot?.phase)) {
        return { snapshot: s, snapshotSeq: s.seq };
      }
      return cur;
    });
  },
  applyEvent(ev, seq) {
    set((cur) => {
      if (seq <= cur.lastSeq) return cur; // duplicate / out-of-order
      return { ...cur, lastSeq: seq, log: [...cur.log, { id: nextLogId++, ev }] };
    });
  },
  reset() {
    set({ snapshot: null, log: [], lastSeq: 0, snapshotSeq: -1 });
  },
}));

function phaseRank(p: RoomSnapshot['phase'] | undefined): number {
  return p === 'ended' ? 2 : p === 'playing' ? 1 : p === 'lobby' ? 0 : -1;
}

