import Fastify from 'fastify';
import { PORT, HOST } from './env.js';
import { registerIdentity } from './identity.js';
import { registerRest } from './rest.js';
import { RoomRegistry } from './rooms.js';
import { attachSocketIo } from './socket.js';
import type { Server as IOServer } from 'socket.io';

export async function buildApp() {
  const app = Fastify({ logger: false });
  await registerIdentity(app);
  const rooms = new RoomRegistry();
  // expose registry on the app for downstream tests/handlers
  (app as unknown as { rooms: RoomRegistry }).rooms = rooms;
  registerRest(app, rooms);
  app.get('/healthz', async () => ({ ok: true }));
  let io: IOServer | null = null;
  app.addHook('onReady', async () => {
    io = attachSocketIo(app.server, rooms);
    (app as unknown as { io: IOServer }).io = io;
  });
  app.addHook('onClose', async () => {
    if (io) await io.close();
  });
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
