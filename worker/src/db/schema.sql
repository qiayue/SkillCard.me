-- SkillCard.me Database Schema

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  github_url TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  ai_summary TEXT,
  ai_category_reason TEXT,
  author TEXT NOT NULL,
  avatar_url TEXT,
  homepage_url TEXT,
  license TEXT,
  language TEXT,
  topics TEXT DEFAULT '[]',
  readme_excerpt TEXT,
  compatibility TEXT DEFAULT '[]',
  category TEXT DEFAULT 'other',
  status TEXT DEFAULT 'active',
  first_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills(slug);

CREATE TABLE IF NOT EXISTS daily_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  stars INTEGER DEFAULT 0,
  forks INTEGER DEFAULT 0,
  open_issues INTEGER DEFAULT 0,
  closed_issues INTEGER DEFAULT 0,
  watchers INTEGER DEFAULT 0,
  contributors INTEGER DEFAULT 0,
  commits_last_30d INTEGER DEFAULT 0,
  last_commit_at TEXT,
  last_release_at TEXT,
  issue_close_rate REAL DEFAULT 0,
  mentions_twitter INTEGER DEFAULT 0,
  mentions_reddit INTEGER DEFAULT 0,
  overall_score REAL DEFAULT 0,
  raw_github_data TEXT,
  UNIQUE(skill_id, date),
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_skill_date ON daily_snapshots(skill_id, date);

CREATE TABLE IF NOT EXISTS scores (
  skill_id INTEGER PRIMARY KEY,
  popularity_score REAL DEFAULT 0,
  activity_score REAL DEFAULT 0,
  maturity_score REAL DEFAULT 0,
  momentum_score REAL DEFAULT 0,
  overall_score REAL DEFAULT 0,
  rank_overall INTEGER,
  rank_category INTEGER,
  trend TEXT DEFAULT 'stable',
  trend_delta REAL DEFAULT 0,
  calculated_at TEXT NOT NULL,
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE TABLE IF NOT EXISTS skill_content (
  skill_id INTEGER PRIMARY KEY,
  overview TEXT,
  use_cases TEXT,
  installation TEXT,
  usage_guide TEXT,
  tips TEXT,
  alternatives TEXT,
  pros_cons TEXT,
  use_case_tags TEXT DEFAULT '[]',
  search_context TEXT,
  related_links TEXT DEFAULT '[]',
  generated_at TEXT NOT NULL,
  source_readme_hash TEXT,
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE TABLE IF NOT EXISTS skill_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_url TEXT,
  discovered_at TEXT NOT NULL,
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE INDEX IF NOT EXISTS idx_skill_sources_skill ON skill_sources(skill_id);
