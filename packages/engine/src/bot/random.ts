import type { BotPolicy } from './policy.js';

export const randomPolicy: BotPolicy = {
  name: 'random',
  decide(view) {
    const intents = view.legalIntents;
    if (intents.length === 0) return { t: 'pass', seat: view.seat };
    const idx = Math.floor(view.rng() * intents.length);
    return intents[idx]!;
  },
};
