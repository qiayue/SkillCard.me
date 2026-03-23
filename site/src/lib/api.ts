const API_BASE = import.meta.env.PUBLIC_API_URL || 'https://skillcard-worker.workers.dev';

async function fetchAPI<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface Skill {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  ai_summary: string | null;
  author: string;
  avatar_url: string | null;
  language: string | null;
  license: string | null;
  topics: string;
  category: string;
  compatibility: string;
  github_url: string;
  created_at: string;
  updated_at: string;
}

export interface Score {
  popularity_score: number;
  activity_score: number;
  maturity_score: number;
  momentum_score: number;
  overall_score: number;
  rank_overall: number | null;
  trend: string;
  trend_delta: number;
}

export interface SkillContent {
  overview: string | null;
  use_cases: string | null;
  installation: string | null;
  usage_guide: string | null;
  tips: string | null;
  pros_cons: string | null;
  alternatives: string | null;
  use_case_tags: string;
  related_links: string;
}

export interface SkillListItem extends Skill {
  score: Score | null;
}

export interface SkillDetail extends Skill {
  score: Score | null;
  content: SkillContent | null;
  history: { date: string; stars: number; overall_score: number }[];
}

export async function getSkills(params?: {
  category?: string;
  sort?: string;
  page?: number;
}): Promise<{ data: SkillListItem[]; pagination: { total: number; total_pages: number } }> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set('category', params.category);
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.page) qs.set('page', String(params.page));
  return fetchAPI(`/api/skills?${qs}`);
}

export async function getSkillDetail(slug: string): Promise<SkillDetail> {
  return fetchAPI(`/api/skills/${slug}`);
}

export async function getTrending(): Promise<SkillListItem[]> {
  return fetchAPI('/api/trending');
}

export async function getCategories(): Promise<{ category: string; count: number }[]> {
  return fetchAPI('/api/categories');
}

export async function getStats(): Promise<{
  total_skills: number;
  active_skills: number;
  total_stars: number;
  categories: number;
}> {
  return fetchAPI('/api/stats');
}
