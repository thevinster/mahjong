import type { RedactedGameState, Intent, Seat, GameState, Hand } from '@mahjong/engine';
import { legalIntents } from '@mahjong/engine';

/**
 * Builds a "shadow" GameState that legalIntents can consume for the viewer's
 * decisions. Opponent hands are filled with placeholder face-down stubs (any
 * tile works because legalIntents only inspects the viewer's seat data).
 */
export function viewerLegalIntents(snap: RedactedGameState): Intent[] {
  const viewer = snap.viewer;
  const myHandSlot = snap.hands[viewer];
  if (!myHandSlot.own) return [];

  const fakeHand = (count: number): Hand => ({
    concealed: Array.from({ length: count }, () => ({ kind: 'honor', honor: 'E' as const })),
    exposed: [],
    flowers: [],
  });

  const myHand: Hand = {
    concealed: myHandSlot.concealed,
    exposed: myHandSlot.exposed,
    flowers: myHandSlot.flowers,
  };

  const hands: Record<Seat, Hand> = {
    0: viewer === 0 ? myHand : fakeHand((snap.hands[0] as { concealedCount: number }).concealedCount),
    1: viewer === 1 ? myHand : fakeHand((snap.hands[1] as { concealedCount: number }).concealedCount),
    2: viewer === 2 ? myHand : fakeHand((snap.hands[2] as { concealedCount: number }).concealedCount),
    3: viewer === 3 ? myHand : fakeHand((snap.hands[3] as { concealedCount: number }).concealedCount),
  };

  const state: GameState = {
    hands,
    wall: [],                // not used by legalIntents
    deadWall: [],
    discards: snap.discards,
    phase: snap.phase,
    dealer: snap.dealer,
    seatWind: snap.seatWind,
    prevailingWind: snap.prevailingWind,
    handNumber: snap.handNumber,
  };

  return legalIntents(state, viewer) as Intent[];
}
