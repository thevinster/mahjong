import { describe, it, expect } from 'vitest';
import { ENGINE_VERSION } from '../src/index.js';

describe('sanity', () => {
  it('engine exports a version', () => {
    expect(ENGINE_VERSION).toBe('0.0.0');
  });
});
