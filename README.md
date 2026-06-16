# Mahjong

Online 4-player Taiwanese mahjong with real-time multiplayer via Pusher and serverless deployment on Vercel.

## Architecture

This is a TypeScript monorepo with two packages:

### `packages/engine`

Pure game logic:
- Deck shuffling, tile drawing, meld formation
- Turn resolution (discard → claim priority → concealed kong → self-win)
- Win detection (all triplets + pair, Seven Pairs)
- State redaction (hide opponents' concealed tiles)
- Deterministic RNG for reproducible games
- Zero dependencies, fully testable

**91 tests** covering rules, edge cases, and multi-hand simulations.

### `packages/web`

Next.js 14 App Router frontend and API:
- **REST API**: Create room, join, start game, send intents, fetch snapshot
- **Real-time**: Pusher Channels for live event broadcast (draws, discards, wins)
- **State**: Vercel KV (Redis) for room/game persistence with CAS consistency
- **Bots**: Inline heuristic AI (no separate scheduler needed)
- **UI**: React + Zustand for game state, minimal ASCII tile rendering

**7 tests** including full-game integration test (create → play → win via API).

## Development

Install dependencies:

```bash
pnpm install
```

Run all tests:

```bash
pnpm -r test
```

Run engine tests only:

```bash
pnpm -F @mahjong/engine test
```

Run web tests only:

```bash
pnpm -F @mahjong/web test
```

Start dev server (requires `.env.local` with Pusher/KV credentials):

```bash
pnpm -F @mahjong/web dev
```

## Deployment

See [docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md) for:
- Setting up Pusher account
- Configuring Vercel KV
- Environment variables
- Local dev against real infrastructure
- Troubleshooting

## Design Docs

- `docs/superpowers/specs/` — Game rules, architecture decisions
- `docs/superpowers/plans/` — Implementation plans and task breakdowns
