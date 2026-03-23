import { DB } from '../db/queries';
import { CacheClient } from '../lib/cache';
import type { Env } from '../types';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function handleSkillsList(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const category = url.searchParams.get('category') || 'all';
  const sort = url.searchParams.get('sort') || 'overall';
  const order = url.searchParams.get('order') || 'desc';
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);

  const cache = new CacheClient(env.CACHE);
  const cacheKey = CacheClient.keys.skillsList(page, category, sort);
  const cached = await cache.get(cacheKey);
  if (cached) return json(cached);

  const db = new DB(env.DB);
  const result = await db.getSkillsList({ category, sort, order, page, limit });

  const response = {
    data: result.skills,
    pagination: {
      page,
      limit,
      total: result.total,
      total_pages: Math.ceil(result.total / limit),
    },
  };

  await cache.set(cacheKey, response, 1800);
  return json(response);
}

export async function handleSkillDetail(slug: string, env: Env): Promise<Response> {
  const cache = new CacheClient(env.CACHE);
  const cacheKey = CacheClient.keys.skillDetail(slug);
  const cached = await cache.get(cacheKey);
  if (cached) return json(cached);

  const db = new DB(env.DB);
  const detail = await db.getSkillDetail(slug);
  if (!detail) return json({ error: 'Skill not found' }, 404);

  const history = await db.getSnapshotHistory(detail.id, 30);

  const response = { ...detail, history };
  await cache.set(cacheKey, response, 1800);
  return json(response);
}

export async function handleSkillHistory(slug: string, request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get('days') || '30', 10);

  const db = new DB(env.DB);
  const skill = await db.getSkillBySlug(slug);
  if (!skill) return json({ error: 'Skill not found' }, 404);

  const history = await db.getSnapshotHistory(skill.id, days);
  return json({ skill_id: skill.id, slug, history });
}
