// src/server/lib/kv.ts
import type { SessionId } from '../../shared/types/api';

type KV = Devvit.KVNamespace; // provided by Devvit runtime

export interface Lock { key: string; owner: string; until: number; }

export function now() { return Date.now(); }

export async function withLock<T>(kv: KV, key: string, fn: () => Promise<T>, ttlMs = 2000): Promise<T> {
  const owner = crypto.randomUUID();
  const lockKey = `lock:${key}`;
  const start = now();
  while (now() - start < 1500) {
    // try acquire
    const ok = await kv.set(lockKey, owner, { ifNotExists: true, expirationTtl: Math.ceil(ttlMs/1000) });
    if (ok) {
      try { return await fn(); }
      finally { await kv.delete(lockKey); }
    }
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('lock-timeout');
}

export async function getJSON<T>(kv: KV, key: string): Promise<T | null> {
  const raw = await kv.get(key);
  return raw ? JSON.parse(raw) as T : null;
}
export async function setJSON<T>(kv: KV, key: string, value: T, ttlSeconds?: number) {
  await kv.set(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}
