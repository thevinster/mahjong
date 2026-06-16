import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';

export const PLAYER_COOKIE = 'playerId';

/**
 * Read the playerId from the request cookie. If absent, issue a new UUID
 * and set the cookie on the response. Returns the playerId either way.
 *
 * Called from each API route at the top.
 */
export function getOrIssuePlayerId(): string {
  const jar = cookies();
  const existing = jar.get(PLAYER_COOKIE);
  if (existing) return existing.value;
  const id = randomUUID();
  jar.set(PLAYER_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}
