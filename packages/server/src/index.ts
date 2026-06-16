import Fastify from 'fastify';
import { PORT, HOST } from './env.js';
import { registerIdentity } from './identity.js';

export async function buildApp() {
  const app = Fastify({ logger: false });
  await registerIdentity(app);
  app.get('/healthz', async () => ({ ok: true }));
  return app;
}

export async function start() {
  const app = await buildApp();
  await app.listen({ port: PORT, host: HOST });
  console.log(`mahjong server listening on http://${HOST}:${PORT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
