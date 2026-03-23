import type { Skill, DailySnapshot, Score, SkillContent, SkillSource, SkillDetail } from '../types';

export class DB {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // ─── Skills ────────────────────────────────────────────

  async getActiveSkills(): Promise<Skill[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM skills WHERE status = 'active'")
      .all<Skill>();
    return results;
  }

  async getSkillById(id: number): Promise<Skill | null> {
    return this.db.prepare('SELECT * FROM skills WHERE id = ?').bind(id).first<Skill>();
  }

  async getSkillBySlug(slug: string): Promise<Skill | null> {
    return this.db.prepare('SELECT * FROM skills WHERE slug = ?').bind(slug).first<Skill>();
  }

  async skillExists(id: number): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT 1 FROM skills WHERE id = ?')
      .bind(id)
      .first<{ '1': number }>();
    return row !== null;
  }

  async upsertSkill(skill: Omit<Skill, 'first_seen_at'> & { first_seen_at?: string }): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO skills (id, slug, github_url, name, description, ai_summary, ai_category_reason,
          author, avatar_url, homepage_url, license, language, topics, readme_excerpt,
          compatibility, category, status, first_seen_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          slug=excluded.slug, github_url=excluded.github_url, name=excluded.name,
          description=excluded.description, ai_summary=excluded.ai_summary,
          ai_category_reason=excluded.ai_category_reason, author=excluded.author,
          avatar_url=excluded.avatar_url, homepage_url=excluded.homepage_url,
          license=excluded.license, language=excluded.language, topics=excluded.topics,
          readme_excerpt=excluded.readme_excerpt, compatibility=excluded.compatibility,
          category=excluded.category, status=excluded.status, updated_at=excluded.updated_at`
      )
      .bind(
        skill.id, skill.slug, skill.github_url, skill.name, skill.description,
        skill.ai_summary, skill.ai_category_reason, skill.author, skill.avatar_url,
        skill.homepage_url, skill.license, skill.language, skill.topics,
        skill.readme_excerpt, skill.compatibility, skill.category, skill.status,
        skill.first_seen_at || now, skill.created_at, skill.updated_at || now
      )
      .run();
  }

  async deleteSkill(id: number): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM skill_content WHERE skill_id = ?').bind(id),
      this.db.prepare('DELETE FROM skill_sources WHERE skill_id = ?').bind(id),
      this.db.prepare('DELETE FROM scores WHERE skill_id = ?').bind(id),
      this.db.prepare('DELETE FROM daily_snapshots WHERE skill_id = ?').bind(id),
      this.db.prepare('DELETE FROM skills WHERE id = ?').bind(id),
    ]);
  }

  // ─── Skills List (with scores) ─────────────────────────

  async getSkillsList(params: {
    category?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
  }): Promise<{ skills: (Skill & { score: Score | null })[]; total: number }> {
    const { category, sort = 'overall', order = 'desc', page = 1, limit = 20 } = params;
    const offset = (page - 1) * limit;

    let where = "WHERE s.status = 'active'";
    const binds: (string | number)[] = [];

    if (category && category !== 'all') {
      where += ' AND s.category = ?';
      binds.push(category);
    }

    const sortColumn = {
      overall: 'sc.overall_score',
      popularity: 'sc.popularity_score',
      activity: 'sc.activity_score',
      maturity: 'sc.maturity_score',
      momentum: 'sc.momentum_score',
      stars: 'snap.stars',
      name: 's.name',
    }[sort] || 'sc.overall_score';

    const dir = order === 'asc' ? 'ASC' : 'DESC';

    const countStmt = this.db
      .prepare(`SELECT COUNT(*) as total FROM skills s ${where}`)
      .bind(...binds);
    const countResult = await countStmt.first<{ total: number }>();
    const total = countResult?.total || 0;

    const query = `
      SELECT s.*, sc.popularity_score, sc.activity_score, sc.maturity_score,
        sc.momentum_score, sc.overall_score AS sc_overall, sc.rank_overall,
        sc.rank_category, sc.trend, sc.trend_delta, sc.calculated_at
      FROM skills s
      LEFT JOIN scores sc ON s.id = sc.skill_id
      LEFT JOIN (
        SELECT skill_id, stars, MAX(date) as latest
        FROM daily_snapshots GROUP BY skill_id
      ) snap ON s.id = snap.skill_id
      ${where}
      ORDER BY ${sortColumn} ${dir} NULLS LAST
      LIMIT ? OFFSET ?
    `;

    const { results } = await this.db
      .prepare(query)
      .bind(...binds, limit, offset)
      .all<Skill & {
        popularity_score: number | null;
        activity_score: number | null;
        maturity_score: number | null;
        momentum_score: number | null;
        sc_overall: number | null;
        rank_overall: number | null;
        rank_category: number | null;
        trend: string | null;
        trend_delta: number | null;
        calculated_at: string | null;
      }>();

    const skills = results.map((row) => ({
      ...row,
      score: row.calculated_at
        ? {
            skill_id: row.id,
            popularity_score: row.popularity_score || 0,
            activity_score: row.activity_score || 0,
            maturity_score: row.maturity_score || 0,
            momentum_score: row.momentum_score || 0,
            overall_score: row.sc_overall || 0,
            rank_overall: row.rank_overall,
            rank_category: row.rank_category,
            trend: row.trend || 'stable',
            trend_delta: row.trend_delta || 0,
            calculated_at: row.calculated_at!,
          }
        : null,
    }));

    return { skills, total };
  }

  // ─── Skill Detail ──────────────────────────────────────

  async getSkillDetail(slug: string): Promise<SkillDetail | null> {
    const skill = await this.getSkillBySlug(slug);
    if (!skill) return null;

    const [score, content, sources] = await Promise.all([
      this.db.prepare('SELECT * FROM scores WHERE skill_id = ?').bind(skill.id).first<Score>(),
      this.db.prepare('SELECT * FROM skill_content WHERE skill_id = ?').bind(skill.id).first<SkillContent>(),
      this.db.prepare('SELECT * FROM skill_sources WHERE skill_id = ?').bind(skill.id).all<SkillSource>(),
    ]);

    return { ...skill, score, content, sources: sources.results };
  }

  // ─── Snapshots ─────────────────────────────────────────

  async upsertSnapshot(snapshot: Omit<DailySnapshot, 'id'>): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO daily_snapshots (skill_id, date, stars, forks, open_issues, closed_issues,
          watchers, contributors, commits_last_30d, last_commit_at, last_release_at,
          issue_close_rate, mentions_twitter, mentions_reddit, overall_score, raw_github_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(skill_id, date) DO UPDATE SET
          stars=excluded.stars, forks=excluded.forks, open_issues=excluded.open_issues,
          closed_issues=excluded.closed_issues, watchers=excluded.watchers,
          contributors=excluded.contributors, commits_last_30d=excluded.commits_last_30d,
          last_commit_at=excluded.last_commit_at, last_release_at=excluded.last_release_at,
          issue_close_rate=excluded.issue_close_rate, overall_score=excluded.overall_score,
          raw_github_data=excluded.raw_github_data`
      )
      .bind(
        snapshot.skill_id, snapshot.date, snapshot.stars, snapshot.forks,
        snapshot.open_issues, snapshot.closed_issues, snapshot.watchers,
        snapshot.contributors, snapshot.commits_last_30d, snapshot.last_commit_at,
        snapshot.last_release_at, snapshot.issue_close_rate,
        snapshot.mentions_twitter, snapshot.mentions_reddit,
        snapshot.overall_score, snapshot.raw_github_data
      )
      .run();
  }

  async getSnapshot(skillId: number, date: string): Promise<DailySnapshot | null> {
    return this.db
      .prepare('SELECT * FROM daily_snapshots WHERE skill_id = ? AND date = ?')
      .bind(skillId, date)
      .first<DailySnapshot>();
  }

  async getSnapshotNDaysAgo(skillId: number, daysAgo: number): Promise<DailySnapshot | null> {
    const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    return this.getSnapshot(skillId, date);
  }

  async getSnapshotHistory(skillId: number, days = 30): Promise<DailySnapshot[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const { results } = await this.db
      .prepare(
        'SELECT * FROM daily_snapshots WHERE skill_id = ? AND date >= ? ORDER BY date ASC'
      )
      .bind(skillId, since)
      .all<DailySnapshot>();
    return results;
  }

  /** Get aggregate data across all snapshots for normalization */
  async getAllLatestSnapshotValues(): Promise<{
    stars: number[];
    forks: number[];
    watchers: number[];
    commits30d: number[];
    contributors: number[];
    starsGained7d: number[];
    starsGained30d: number[];
  }> {
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { results: latest } = await this.db
      .prepare(
        `SELECT d.* FROM daily_snapshots d
         INNER JOIN (SELECT skill_id, MAX(date) as max_date FROM daily_snapshots GROUP BY skill_id) m
         ON d.skill_id = m.skill_id AND d.date = m.max_date`
      )
      .all<DailySnapshot>();

    const { results: week } = await this.db
      .prepare('SELECT skill_id, stars FROM daily_snapshots WHERE date = ?')
      .bind(sevenDaysAgo)
      .all<{ skill_id: number; stars: number }>();

    const { results: month } = await this.db
      .prepare('SELECT skill_id, stars FROM daily_snapshots WHERE date = ?')
      .bind(thirtyDaysAgo)
      .all<{ skill_id: number; stars: number }>();

    const weekMap = new Map(week.map((r) => [r.skill_id, r.stars]));
    const monthMap = new Map(month.map((r) => [r.skill_id, r.stars]));

    return {
      stars: latest.map((r) => r.stars),
      forks: latest.map((r) => r.forks),
      watchers: latest.map((r) => r.watchers),
      commits30d: latest.map((r) => r.commits_last_30d),
      contributors: latest.map((r) => r.contributors),
      starsGained7d: latest.map((r) => r.stars - (weekMap.get(r.skill_id) || r.stars)),
      starsGained30d: latest.map((r) => r.stars - (monthMap.get(r.skill_id) || r.stars)),
    };
  }

  // ─── Scores ────────────────────────────────────────────

  async upsertScore(score: Score): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO scores (skill_id, popularity_score, activity_score, maturity_score,
          momentum_score, overall_score, rank_overall, rank_category, trend, trend_delta, calculated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(skill_id) DO UPDATE SET
          popularity_score=excluded.popularity_score, activity_score=excluded.activity_score,
          maturity_score=excluded.maturity_score, momentum_score=excluded.momentum_score,
          overall_score=excluded.overall_score, rank_overall=excluded.rank_overall,
          rank_category=excluded.rank_category, trend=excluded.trend,
          trend_delta=excluded.trend_delta, calculated_at=excluded.calculated_at`
      )
      .bind(
        score.skill_id, score.popularity_score, score.activity_score,
        score.maturity_score, score.momentum_score, score.overall_score,
        score.rank_overall, score.rank_category, score.trend,
        score.trend_delta, score.calculated_at
      )
      .run();
  }

  async updateSnapshotScore(skillId: number, date: string, overallScore: number): Promise<void> {
    await this.db
      .prepare('UPDATE daily_snapshots SET overall_score = ? WHERE skill_id = ? AND date = ?')
      .bind(overallScore, skillId, date)
      .run();
  }

  // ─── Trending ──────────────────────────────────────────

  async getTrending(limit = 10): Promise<(Skill & { score: Score })[]> {
    const { results } = await this.db
      .prepare(
        `SELECT s.*, sc.* FROM skills s
        JOIN scores sc ON s.id = sc.skill_id
        WHERE s.status = 'active'
        ORDER BY sc.momentum_score DESC
        LIMIT ?`
      )
      .bind(limit)
      .all();
    return results as (Skill & { score: Score })[];
  }

  // ─── Categories ────────────────────────────────────────

  async getCategoryCounts(): Promise<{ category: string; count: number }[]> {
    const { results } = await this.db
      .prepare(
        "SELECT category, COUNT(*) as count FROM skills WHERE status = 'active' GROUP BY category ORDER BY count DESC"
      )
      .all<{ category: string; count: number }>();
    return results;
  }

  // ─── Stats ─────────────────────────────────────────────

  async getStats(): Promise<{
    total_skills: number;
    active_skills: number;
    total_stars: number;
    categories: number;
  }> {
    const stats = await this.db
      .prepare(
        `SELECT
          COUNT(*) as total_skills,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_skills,
          COUNT(DISTINCT category) as categories
        FROM skills`
      )
      .first<{ total_skills: number; active_skills: number; categories: number }>();

    const starResult = await this.db
      .prepare(
        `SELECT COALESCE(SUM(d.stars), 0) as total_stars FROM daily_snapshots d
        INNER JOIN (SELECT skill_id, MAX(date) as max_date FROM daily_snapshots GROUP BY skill_id) m
        ON d.skill_id = m.skill_id AND d.date = m.max_date`
      )
      .first<{ total_stars: number }>();

    return {
      total_skills: stats?.total_skills || 0,
      active_skills: stats?.active_skills || 0,
      total_stars: starResult?.total_stars || 0,
      categories: stats?.categories || 0,
    };
  }

  // ─── Skill Content ─────────────────────────────────────

  async upsertSkillContent(content: SkillContent): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO skill_content (skill_id, overview, use_cases, installation, usage_guide,
          tips, alternatives, pros_cons, use_case_tags, search_context, related_links,
          generated_at, source_readme_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(skill_id) DO UPDATE SET
          overview=excluded.overview, use_cases=excluded.use_cases,
          installation=excluded.installation, usage_guide=excluded.usage_guide,
          tips=excluded.tips, alternatives=excluded.alternatives,
          pros_cons=excluded.pros_cons, use_case_tags=excluded.use_case_tags,
          search_context=excluded.search_context, related_links=excluded.related_links,
          generated_at=excluded.generated_at, source_readme_hash=excluded.source_readme_hash`
      )
      .bind(
        content.skill_id, content.overview, content.use_cases,
        content.installation, content.usage_guide, content.tips,
        content.alternatives, content.pros_cons, content.use_case_tags,
        content.search_context, content.related_links,
        content.generated_at, content.source_readme_hash
      )
      .run();
  }

  // ─── Skill Sources ─────────────────────────────────────

  async addSkillSource(source: Omit<SkillSource, 'id'>): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO skill_sources (skill_id, source_type, source_url, discovered_at) VALUES (?, ?, ?, ?)'
      )
      .bind(source.skill_id, source.source_type, source.source_url, source.discovered_at)
      .run();
  }

  // ─── Use Case Tags ─────────────────────────────────────

  async getUseCaseTags(): Promise<{ tag: string; count: number }[]> {
    const { results } = await this.db
      .prepare(
        `SELECT sc.use_case_tags FROM skill_content sc
        JOIN skills s ON sc.skill_id = s.id
        WHERE s.status = 'active' AND sc.use_case_tags != '[]'`
      )
      .all<{ use_case_tags: string }>();

    const tagCounts = new Map<string, number>();
    for (const row of results) {
      try {
        const tags = JSON.parse(row.use_case_tags) as string[];
        for (const tag of tags) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      } catch { /* skip */ }
    }

    return [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getSkillsByUseCaseTag(tag: string): Promise<(Skill & { score: Score | null })[]> {
    const { results } = await this.db
      .prepare(
        `SELECT s.*, sc2.overall_score as sc_overall FROM skills s
        JOIN skill_content sc ON s.id = sc.skill_id
        LEFT JOIN scores sc2 ON s.id = sc2.skill_id
        WHERE s.status = 'active' AND sc.use_case_tags LIKE ?
        ORDER BY sc2.overall_score DESC NULLS LAST`
      )
      .bind(`%"${tag}"%`)
      .all();
    return results as (Skill & { score: Score | null })[];
  }
}
