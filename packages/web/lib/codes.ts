import { randomBytes } from 'node:crypto';

export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateRoomCode(): string {
  const bytes = randomBytes(4);
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += ROOM_CODE_ALPHABET[bytes[i]! & 0x1f];
  }
  return out;
}
