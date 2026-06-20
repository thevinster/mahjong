'use client';
import { create } from 'zustand';
import type { Event } from '@mahjong/engine';
import type { RoomSnapshot } from '@/lib/protocol';

type LogEntry = { id: number; text: string };

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
      return { ...cur, lastSeq: seq, log: [...cur.log, { id: nextLogId++, text: describeEvent(ev) }] };
    });
  },
  reset() {
    set({ snapshot: null, log: [], lastSeq: 0, snapshotSeq: -1 });
  },
}));

function phaseRank(p: RoomSnapshot['phase'] | undefined): number {
  return p === 'ended' ? 2 : p === 'playing' ? 1 : p === 'lobby' ? 0 : -1;
}

function describeEvent(ev: Event): string {
  switch (ev.t) {
    case 'dealt':           return 'Dealt';
    case 'drew':            return `Seat ${ev.seat} drew`;
    case 'discarded':       return `Seat ${ev.seat} discarded ${describeTile(ev.tile)}`;
    case 'flowerReplaced':  return `Seat ${ev.seat} replaced flower ${ev.flower}`;
    case 'melded':          return `Seat ${ev.seat} melded ${ev.meld.kind}`;
    case 'won':             return `Seat ${ev.seat} won (${ev.score} tai) from ${ev.from}`;
    case 'drawWall':        return `Wall exhausted — draw`;
  }
}
function describeTile(t: import('@mahjong/engine').Tile): string {
  switch (t.kind) {
    case 'suit':   return `${t.suit}${t.rank}`;
    case 'honor':  return t.honor;
    case 'flower': return t.flower;
  }
}
