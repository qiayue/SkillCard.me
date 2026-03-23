import { DB } from '../db/queries';
import { calculateScores } from '../lib/scoring';
import { CacheClient } from '../lib/cache';
import type { Env, Score } from '../types';

export async function calculateAllScores(env: Env): Promise<void> {
  const db = new DB(env.DB);
  const skills = await db.getActiveSkills();
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  console.log(`[scores] Calculating scores for ${skills.length} skills`);

  // Get normalization data
  const allData = await db.getAllLatestSnapshotValues();

  const allScores: Score[] = [];

  for (const skill of skills) {
    try {
      const snapshot = await db.getSnapshot(skill.id, today);
      if (!snapshot) continue;

      const history7d = await db.getSnapshotNDaysAgo(skill.id, 7);
      const history30d = await db.getSnapshotNDaysAgo(skill.id, 30);

      const scores = calculateScores(
        {
          ...snapshot,
          skill_created_at: skill.created_at,
          skill_readme: skill.readme_excerpt,
          skill_license: skill.license,
        },
        history7d,
        history30d,
        allData
      );

      const score: Score = {
        skill_id: skill.id,
        ...scores,
        rank_overall: null,
        rank_category: null,
        calculated_at: now,
      };

      allScores.push(score);
    } catch (error) {
      console.error(`[scores] Failed for ${skill.slug}:`, error);
    }
  }

  // Calculate rankings
  allScores.sort((a, b) => b.overall_score - a.overall_score);
  allScores.forEach((s, i) => (s.rank_overall = i + 1));

  // Category rankings
  const byCategory = new Map<string, Score[]>();
  for (const score of allScores) {
    const skill = skills.find((s) => s.id === score.skill_id);
    if (!skill) continue;
    const cat = skill.category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(score);
  }
  for (const catScores of byCategory.values()) {
    catScores.sort((a, b) => b.overall_score - a.overall_score);
    catScores.forEach((s, i) => (s.rank_category = i + 1));
  }

  // Write scores and update snapshots
  for (const score of allScores) {
    await db.upsertScore(score);
    await db.updateSnapshotScore(score.skill_id, today, score.overall_score);
  }

  // Invalidate caches
  const cache = new CacheClient(env.CACHE);
  await cache.invalidatePattern('skills:');
  await cache.invalidatePattern('skill:');
  await cache.delete(CacheClient.keys.trending());
  await cache.delete(CacheClient.keys.stats());

  // Trigger Pages rebuild
  if (env.DEPLOY_HOOK_URL) {
    try {
      await fetch(env.DEPLOY_HOOK_URL, { method: 'POST' });
      console.log('[scores] Pages rebuild triggered');
    } catch (e) {
      console.error('[scores] Failed to trigger rebuild:', e);
    }
  }

  console.log(`[scores] Done: ${allScores.length} scores calculated`);
}
