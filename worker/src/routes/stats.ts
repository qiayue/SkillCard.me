import { DB } from '../db/queries';
import { CacheClient } from '../lib/cache';
import type { Env } from '../types';

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function handleStats(env: Env): Promise<Response> {
  const cache = new CacheClient(env.CACHE);
  const cached = await cache.get(CacheClient.keys.stats());
  if (cached) return json(cached);

  const db = new DB(env.DB);
  const stats = await db.getStats();
  await cache.set(CacheClient.keys.stats(), stats, 3600);
  return json(stats);
}
