import { describe, it, expect } from 'vitest';
import { generateRoomCode, ROOM_CODE_ALPHABET } from '../src/codes.js';

describe('generateRoomCode', () => {
  it('returns a 4-char string from the alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(4);
      for (const ch of code) expect(ROOM_CODE_ALPHABET.includes(ch)).toBe(true);
    }
  });

  it('alphabet excludes 0/O/1/I (visually ambiguous)', () => {
    expect(ROOM_CODE_ALPHABET.includes('0')).toBe(false);
    expect(ROOM_CODE_ALPHABET.includes('O')).toBe(false);
    expect(ROOM_CODE_ALPHABET.includes('1')).toBe(false);
    expect(ROOM_CODE_ALPHABET.includes('I')).toBe(false);
  });

  it('produces varied codes across many draws', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) codes.add(generateRoomCode());
    expect(codes.size).toBeGreaterThan(50); // not all the same
  });
});
