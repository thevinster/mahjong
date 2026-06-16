import { vi } from 'vitest';

interface Broadcast {
  channel: string;
  event: string;
  data: unknown;
}

const broadcasts: Broadcast[] = [];

class FakePusher {
  trigger(channel: string, event: string, data: unknown): Promise<void> {
    broadcasts.push({ channel, event, data });
    return Promise.resolve();
  }

  authorizeChannel(): { auth: string } {
    return { auth: 'fake-auth' };
  }
}

export function getBroadcasts(): readonly Broadcast[] {
  return [...broadcasts];
}

export function resetBroadcasts(): void {
  broadcasts.length = 0;
}

// Mock env module to avoid requiring real env vars
vi.mock('../lib/env.js', () => ({
  env: {
    pusher: {
      appId: () => 'fake-app-id',
      key: () => 'fake-key',
      secret: () => 'fake-secret',
      cluster: () => 'fake-cluster',
    },
  },
}));

// Inject before any module that imports pusher
vi.mock('pusher', () => ({ default: FakePusher }));
