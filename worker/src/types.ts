export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  AI: Ai;
  GITHUB_TOKEN: string;
  SERPER_API_KEY: string;
  DEPLOY_HOOK_URL: string;
  ADMIN_API_KEY: string;
  SITE_URL: string;
}

export interface Skill {
  id: number;
  slug: string;
  github_url: string;
  name: string;
  description: string | null;
  ai_summary: string | null;
  ai_category_reason: string | null;
  author: string;
  avatar_url: string | null;
  homepage_url: string | null;
  license: string | null;
  language: string | null;
  topics: string;
  readme_excerpt: string | null;
  compatibility: string;
  category: string;
  status: string;
  first_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface DailySnapshot {
  id: number;
  skill_id: number;
  date: string;
  stars: number;
  forks: number;
  open_issues: number;
  closed_issues: number;
  watchers: number;
  contributors: number;
  commits_last_30d: number;
  last_commit_at: string | null;
  last_release_at: string | null;
  issue_close_rate: number;
  mentions_twitter: number;
  mentions_reddit: number;
  overall_score: number;
  raw_github_data: string | null;
}

export interface Score {
  skill_id: number;
  popularity_score: number;
  activity_score: number;
  maturity_score: number;
  momentum_score: number;
  overall_score: number;
  rank_overall: number | null;
  rank_category: number | null;
  trend: string;
  trend_delta: number;
  calculated_at: string;
}

export interface SkillContent {
  skill_id: number;
  overview: string | null;
  use_cases: string | null;
  installation: string | null;
  usage_guide: string | null;
  tips: string | null;
  alternatives: string | null;
  pros_cons: string | null;
  use_case_tags: string;
  search_context: string | null;
  related_links: string;
  generated_at: string;
  source_readme_hash: string | null;
}

export interface SkillSource {
  id: number;
  skill_id: number;
  source_type: string;
  source_url: string | null;
  discovered_at: string;
}

// GitHub API response types
export interface GitHubRepo {
  id: number;
  full_name: string;
  html_url: string;
  name: string;
  description: string | null;
  owner: {
    login: string;
    avatar_url: string;
  };
  homepage: string | null;
  license: { spdx_id: string } | null;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  watchers_count: number;
  created_at: string;
  updated_at: string;
  pushed_at: string;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    author: { date: string };
  };
}

export interface GitHubRelease {
  published_at: string;
  tag_name: string;
}

// Serper API types
export interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

export interface SerperResponse {
  organic: SerperResult[];
  credits: number;
}

// API response types
export interface SkillListItem extends Skill {
  score?: Score;
}

export interface SkillDetail extends Skill {
  score: Score | null;
  content: SkillContent | null;
  sources: SkillSource[];
}
