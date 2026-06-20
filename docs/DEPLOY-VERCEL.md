# Deploying to Vercel

This guide covers deploying the Mahjong web application to Vercel.

## Prerequisites

- Vercel account (free tier works)
- Pusher account (free tier works)
- Git repository connected to Vercel

## One-Time Setup

### 0. Project Import — Root Directory (IMPORTANT)

This is a pnpm monorepo. The Next.js app lives in `packages/web`, which depends
on the `@mahjong/engine` workspace package.

When importing the repo into Vercel (or in **Settings → Build and Deployment**):

- Set **Root Directory** to `packages/web`.
- Do **not** set a custom Output Directory (leave it default — Vercel resolves
  `.next` relative to the Root Directory).

Why: Vercel detects the framework and reads `vercel.json` **from the Root
Directory**. `packages/web/vercel.json` force-builds the engine first, then the
web app. If Root Directory is left at the repo root you'll get "No Next.js
version detected" (the root `package.json` has no `next`). If it's `packages/web`
*and* a config also prepends `packages/web` to the output path, you'll get a
doubled `packages/web/packages/web/.next`. Root Directory = `packages/web` with
the committed `packages/web/vercel.json` (no path prefixes) avoids both.

### 1. Pusher Account Setup

1. Sign up at [pusher.com](https://pusher.com/)
2. Create a new Channels app
3. Note down the following credentials:
   - App ID
   - Key
   - Secret
   - Cluster (e.g., `us2`, `eu`, `ap1`)

### 2. Vercel KV Setup

1. In your Vercel project dashboard, go to **Storage**
2. Click **Create Database** → **KV**
3. Name it (e.g., `mahjong-kv`)
4. After creation, Vercel automatically injects `KV_REST_API_*` environment variables

### 3. Environment Variables

In your Vercel project settings → **Environment Variables**, add:

```
PUSHER_APP_ID=<your-app-id>
PUSHER_KEY=<your-key>
PUSHER_SECRET=<your-secret>
PUSHER_CLUSTER=<your-cluster>
NEXT_PUBLIC_PUSHER_KEY=<your-key>
NEXT_PUBLIC_PUSHER_CLUSTER=<your-cluster>
```

`NEXT_PUBLIC_PUSHER_KEY` and `NEXT_PUBLIC_PUSHER_CLUSTER` are required — the
browser client reads them to subscribe to channels. They hold the SAME values as
`PUSHER_KEY` and `PUSHER_CLUSTER` (the `NEXT_PUBLIC_` prefix makes Vercel inline
them into the client bundle; never expose `PUSHER_SECRET` this way).

The KV variables are auto-injected when you create a Vercel KV database.

### 4. Deploy

Push to your connected branch (e.g., `main` or `master`). With Root Directory =
`packages/web`, Vercel reads `packages/web/vercel.json` and will:
1. Install dependencies via `pnpm install --frozen-lockfile` (resolves the whole workspace)
2. Force-build the engine: `pnpm -F @mahjong/engine exec tsc -b --force`
3. Build the web package: `pnpm -F @mahjong/web build`
4. Deploy the Next.js app from `packages/web/.next`

## Local Development Against Real Pusher/KV

To test locally with production-like infrastructure:

### 1. Get Vercel KV credentials

```bash
# Link to your Vercel project
vercel link

# Pull environment variables
vercel env pull .env.local
```

This creates `.env.local` with `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

### 2. Add Pusher credentials

Add to `.env.local`:

```
PUSHER_APP_ID=<your-app-id>
PUSHER_KEY=<your-key>
PUSHER_SECRET=<your-secret>
PUSHER_CLUSTER=<your-cluster>
```

### 3. Run dev server

```bash
pnpm -F @mahjong/web dev
```

Visit `http://localhost:3000`

## Local Prod-Mode Test

To test the production build locally:

```bash
# Build all packages
pnpm -F @mahjong/engine build
pnpm -F @mahjong/web build

# Start production server
pnpm -F @mahjong/web start
```

Visit `http://localhost:3000`

## Architecture Notes

### Bot Scheduler

- **Inline execution**: Bot turns run synchronously within API routes (no separate scheduler process)
- This works for Vercel's serverless model where each request is isolated
- Bot logic uses the same `applyIntent` + `step` flow as human players

### Timeouts

- Serverless functions have a 10s timeout on Hobby tier, 60s on Pro
- Games complete well within these limits (typical hand: ~70 iterations, <1s)
- If a hand somehow times out, the room state persists in KV; next action will retry from the last persisted state

### Pusher Free Tier Limits

- 200k messages/day
- 100 concurrent connections
- Adequate for small-scale testing and demo deployments
- For production, consider Channels plan or alternative PubSub (Ably, Socket.io + adapter)

### State Persistence

- All room state is in Vercel KV (Redis-compatible)
- CAS (compare-and-swap) ensures consistency under concurrent writes
- No in-memory state → safe for serverless cold starts

## Troubleshooting

### "missing env var PUSHER_APP_ID"

- Verify environment variables are set in Vercel dashboard
- For local dev, ensure `.env.local` exists and is loaded

### "room not found" after deploy

- KV database may be empty after first deploy
- Create a new room via the landing page

### Pusher events not received

- Check Pusher dashboard → Debug Console for incoming triggers
- Verify `PUSHER_KEY` in environment variables matches the client-side key
- Check browser console for Pusher connection errors

### Build fails with "workspace not found"

- Ensure `pnpm-workspace.yaml` is in repo root
- Verify both `packages/engine` and `packages/web` directories exist
- Check `vercel.json` has correct `buildCommand` (builds engine first)
