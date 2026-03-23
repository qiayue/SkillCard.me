import { normalizeValue, recencyFactor, repoAgeFactor, readmeLengthScore } from './normalize';
import type { DailySnapshot, Skill, Score } from '../types';

interface SnapshotWithMeta extends DailySnapshot {
  skill_created_at: string;
  skill_readme: string | null;
  skill_license: string | null;
}

interface AllSnapshots {
  stars: number[];
  forks: number[];
  watchers: number[];
  commits30d: number[];
  contributors: number[];
  starsGained7d: number[];
  starsGained30d: number[];
}

export function calculateScores(
  current: SnapshotWithMeta,
  history7d: DailySnapshot | null,
  history30d: DailySnapshot | null,
  allData: AllSnapshots
): Omit<Score, 'skill_id' | 'rank_overall' | 'rank_category' | 'calculated_at'> {
  const starsGained7d = history7d ? current.stars - history7d.stars : 0;
  const starsGained30d = history30d ? current.stars - history30d.stars : 0;
  const commitsGained7d = history7d ? current.commits_last_30d - history7d.commits_last_30d : 0;

  // Popularity (V1: no social media)
  const popularityRaw =
    normalizeValue(current.stars, allData.stars, 0, 500) * 0.5 +
    normalizeValue(current.forks, allData.forks, 0, 100) * 0.3 +
    normalizeValue(current.watchers, allData.watchers, 0, 200) * 0.2;

  // Activity
  const activityRaw =
    normalizeValue(current.commits_last_30d, allData.commits30d, 0, 50) * 0.35 +
    current.issue_close_rate * 100 * 0.25 +
    recencyFactor(current.last_commit_at) * 100 * 0.3 +
    (current.last_release_at && recencyFactor(current.last_release_at) > 0.5 ? 100 : 0) * 0.1;

  // Maturity
  const maturityRaw =
    Math.min(Math.log(current.stars + 1) / Math.log(1000), 1) * 100 * 0.25 +
    normalizeValue(current.contributors, allData.contributors, 0, 20) * 0.25 +
    (current.skill_license ? 100 : 0) * 0.1 +
    readmeLengthScore(current.skill_readme) * 100 * 0.2 +
    repoAgeFactor(current.skill_created_at) * 100 * 0.2;

  // Momentum (with cold-start handling)
  const momentumRaw = history7d
    ? normalizeValue(Math.max(starsGained7d, 0), allData.starsGained7d, 0, 50) * 0.6 +
      normalizeValue(Math.max(starsGained30d, 0), allData.starsGained30d, 0, 100) * 0.25 +
      normalizeValue(Math.max(commitsGained7d, 0), [0, 5, 10, 20, 30], 0, 20) * 0.15
    : 50; // Default to 50 during cold-start

  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const popularity = clamp(popularityRaw);
  const activity = clamp(activityRaw);
  const maturity = clamp(maturityRaw);
  const momentum = clamp(momentumRaw);

  const overall = popularity * 0.3 + activity * 0.25 + maturity * 0.2 + momentum * 0.25;

  // Trend
  const prevOverall = history7d?.overall_score ?? overall;
  const delta = overall - prevOverall;
  let trend: string = 'stable';
  if (delta > 5) trend = 'rising';
  else if (delta < -5) trend = 'declining';

  return {
    popularity_score: Math.round(popularity * 100) / 100,
    activity_score: Math.round(activity * 100) / 100,
    maturity_score: Math.round(maturity * 100) / 100,
    momentum_score: Math.round(momentum * 100) / 100,
    overall_score: Math.round(overall * 100) / 100,
    trend,
    trend_delta: Math.round(delta * 100) / 100,
  };
}
