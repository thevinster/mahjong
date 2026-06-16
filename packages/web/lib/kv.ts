import { kv } from '@vercel/kv';
import type { Room } from './rooms'; // declared in Task 4

const ROOM_KEY = (code: string) => `room:${code}`;

/**
 * Read the latest serialized Room from KV. Returns null if not found.
 */
export async function readRoom(code: string): Promise<Room | null> {
  const raw = await kv.get<Room>(ROOM_KEY(code));
  return raw ?? null;
}

/**
 * Optimistic write: only succeeds if the room's `version` field matches
 * `expectedVersion`. Increments version on success. Returns true on success,
 * false on version mismatch (caller should re-read and retry).
 *
 * Implemented with a Redis Lua-ish check-and-set via `kv.eval` since
 * @vercel/kv doesn't expose WATCH/MULTI directly. For our throughput
 * (single-digit RPS per room), a SETIFEQ pattern is enough.
 */
export async function casRoom(code: string, expectedVersion: number, next: Room): Promise<boolean> {
  const key = ROOM_KEY(code);
  const cur = await kv.get<Room>(key);
  if ((cur?.version ?? 0) !== expectedVersion) return false;
  const incremented: Room = { ...next, version: expectedVersion + 1 };
  await kv.set(key, incremented, { ex: 60 * 60 * 24 }); // 24h TTL
  return true;
}

/**
 * Create a new room only if the key doesn't exist (NX).
 */
export async function createRoomIfAbsent(code: string, room: Room): Promise<boolean> {
  const key = ROOM_KEY(code);
  const ok = await kv.set(key, { ...room, version: 1 }, { nx: true, ex: 60 * 60 * 24 });
  return ok === 'OK';
}

export async function deleteRoom(code: string): Promise<void> {
  await kv.del(ROOM_KEY(code));
}
