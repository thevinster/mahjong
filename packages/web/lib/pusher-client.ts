'use client';
import PusherJS from 'pusher-js';

let _client: PusherJS | null = null;

export function getPusherClient(): PusherJS {
  if (_client) return _client;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) throw new Error('NEXT_PUBLIC_PUSHER_KEY / CLUSTER missing');
  _client = new PusherJS(key, {
    cluster,
    authEndpoint: '/api/pusher/auth',
  });
  return _client;
}
