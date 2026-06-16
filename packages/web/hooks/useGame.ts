'use client';
import { create } from 'zustand';
import type { Event, RedactedGameState } from '@mahjong/engine';

type LogEntry = { id: number; text: string };

type GameStore = {
  state: RedactedGameState | null;
  log: LogEntry[];
  lastSeq: number;
  setSnapshot: (s: RedactedGameState) => void;
  applyEvent: (ev: Event, seq: number) => void;
};

let nextLogId = 1;

export const useGame = create<GameStore>((set) => ({
  state: null,
  log: [],
  lastSeq: 0,
  setSnapshot(s) { set({ state: s, lastSeq: 0 }); },
  applyEvent(ev, seq) {
    set((cur) => {
      if (seq <= cur.lastSeq) return cur; // duplicate
      const text = describeEvent(ev);
      return {
        ...cur,
        lastSeq: seq,
        log: [...cur.log, { id: nextLogId++, text }],
      };
    });
  },
}));

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
