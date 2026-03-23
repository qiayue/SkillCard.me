import { DB } from '../db/queries';
import { CacheClient } from '../lib/cache';
import type { Env } from '../types';

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function handleTrending(env: Env): Promise<Response> {
  const cache = new CacheClient(env.CACHE);
  const cached = await cache.get(CacheClient.keys.trending());
  if (cached) return json(cached);

  const db = new DB(env.DB);
  const trending = await db.getTrending(10);
  await cache.set(CacheClient.keys.trending(), trending, 1800);
  return json(trending);
}
