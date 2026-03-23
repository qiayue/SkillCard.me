import { DB } from '../db/queries';
import { GitHubClient } from '../lib/github';
import { SearchClient } from '../lib/search';
import { classifySkill, generateWikiContent } from '../lib/ai';
import { CacheClient } from '../lib/cache';
import type { Env } from '../types';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function unauthorized() {
  return json({ error: 'Unauthorized' }, 401);
}

function checkAuth(request: Request, env: Env): boolean {
  const key = request.headers.get('X-API-Key') || new URL(request.url).searchParams.get('key');
  return key === env.ADMIN_API_KEY;
}

/** Parse owner/repo from GitHub URL */
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

/** Ingest a single skill from a GitHub URL */
async function ingestSkill(
  githubUrl: string,
  sourceType: string,
  sourceUrl: string | null,
  env: Env
): Promise<{ success: boolean; id?: number; error?: string }> {
  const parsed = parseGitHubUrl(githubUrl);
  if (!parsed) return { success: false, error: 'Invalid GitHub URL' };

  const github = new GitHubClient(env.GITHUB_TOKEN);
  const db = new DB(env.DB);

  try {
    const data = await github.collectSkillData(parsed.owner, parsed.repo);
    const repo = data.repo;

    // Check if already exists
    if (await db.skillExists(repo.id)) {
      return { success: true, id: repo.id, error: 'Already exists' };
    }

    // Search for supplementary info
    const search = new SearchClient(env.SERPER_API_KEY);
    const enrichment = await search.enrichSkillInfo(repo.name, repo.owner.login);

    // AI classify
    const classification = await classifySkill(
      env.AI,
      data.readme || '',
      repo.description,
      repo.topics,
      enrichment.snippets
    );

    // AI generate wiki content
    const wiki = await generateWikiContent(
      env.AI,
      data.readme || '',
      repo.name,
      repo.description,
      repo.language,
      enrichment.snippets
    );

    const now = new Date().toISOString();

    // Insert skill
    await db.upsertSkill({
      id: repo.id,
      slug: repo.full_name.toLowerCase(),
      github_url: repo.html_url,
      name: repo.name,
      description: repo.description,
      ai_summary: classification.summary,
      ai_category_reason: classification.reason,
      author: repo.owner.login,
      avatar_url: repo.owner.avatar_url,
      homepage_url: repo.homepage,
      license: repo.license?.spdx_id || null,
      language: repo.language,
      topics: JSON.stringify(repo.topics),
      readme_excerpt: (data.readme || '').slice(0, 500),
      compatibility: JSON.stringify(classification.compatibility),
      category: classification.category,
      status: 'active',
      created_at: repo.created_at,
      updated_at: now,
    });

    // Insert content
    const readmeHash = data.readme
      ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data.readme))))
          .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
      : null;

    await db.upsertSkillContent({
      skill_id: repo.id,
      overview: wiki.overview,
      use_cases: JSON.stringify(wiki.use_cases),
      installation: wiki.installation,
      usage_guide: wiki.usage_guide,
      tips: wiki.tips,
      alternatives: JSON.stringify(wiki.alternatives),
      pros_cons: JSON.stringify(wiki.pros_cons),
      use_case_tags: JSON.stringify(wiki.use_case_tags),
      search_context: JSON.stringify(enrichment.snippets.slice(0, 10)),
      related_links: JSON.stringify(enrichment.relatedLinks.slice(0, 10)),
      generated_at: now,
      source_readme_hash: readmeHash,
    });

    // Insert snapshot
    const today = now.split('T')[0];
    await db.upsertSnapshot({
      skill_id: repo.id,
      date: today,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      open_issues: repo.open_issues_count,
      closed_issues: data.closed_issues,
      watchers: repo.watchers_count,
      contributors: data.contributors,
      commits_last_30d: data.commits_last_30d,
      last_commit_at: repo.pushed_at,
      last_release_at: data.latest_release?.published_at || null,
      issue_close_rate: data.issue_close_rate,
      mentions_twitter: 0,
      mentions_reddit: 0,
      overall_score: 0,
      raw_github_data: JSON.stringify(repo),
    });

    // Record source
    await db.addSkillSource({
      skill_id: repo.id,
      source_type: sourceType,
      source_url: sourceUrl,
      discovered_at: now,
    });

    return { success: true, id: repo.id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function handleAdminSubmit(request: Request, env: Env): Promise<Response> {
  if (!checkAuth(request, env)) return unauthorized();

  const body = (await request.json()) as {
    github_url: string;
    source_type?: string;
    source_url?: string;
  };
  if (!body.github_url) return json({ error: 'github_url required' }, 400);

  const result = await ingestSkill(
    body.github_url,
    body.source_type || 'manual',
    body.source_url || null,
    env
  );

  // Invalidate cache
  const cache = new CacheClient(env.CACHE);
  await cache.invalidatePattern('skills:');
  await cache.delete(CacheClient.keys.stats());
  await cache.delete(CacheClient.keys.categories());

  return json(result, result.success ? 200 : 400);
}

export async function handleAdminBatchSubmit(request: Request, env: Env): Promise<Response> {
  if (!checkAuth(request, env)) return unauthorized();

  const body = (await request.json()) as {
    urls: string[];
    source_type?: string;
    source_url?: string;
  };
  if (!body.urls || !Array.isArray(body.urls)) return json({ error: 'urls array required' }, 400);

  const results = [];
  for (const url of body.urls) {
    const result = await ingestSkill(
      url,
      body.source_type || 'manual',
      body.source_url || null,
      env
    );
    results.push({ url, ...result });
  }

  const cache = new CacheClient(env.CACHE);
  await cache.invalidatePattern('skills:');
  await cache.delete(CacheClient.keys.stats());
  await cache.delete(CacheClient.keys.categories());

  return json({
    total: results.length,
    success: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
}

export async function handleAdminDelete(id: string, request: Request, env: Env): Promise<Response> {
  if (!checkAuth(request, env)) return unauthorized();

  const db = new DB(env.DB);
  await db.deleteSkill(parseInt(id, 10));

  const cache = new CacheClient(env.CACHE);
  await cache.invalidatePattern('skills:');
  await cache.invalidatePattern('skill:');
  await cache.delete(CacheClient.keys.stats());

  return json({ success: true });
}

export async function handleAdminRefresh(request: Request, env: Env): Promise<Response> {
  if (!checkAuth(request, env)) return unauthorized();
  // Trigger is handled by importing cron modules directly
  return json({ success: true, message: 'Refresh triggered. Run cron manually via wrangler.' });
}

export async function handleAdminRegenerate(id: string, request: Request, env: Env): Promise<Response> {
  if (!checkAuth(request, env)) return unauthorized();

  const db = new DB(env.DB);
  const skill = await db.getSkillById(parseInt(id, 10));
  if (!skill) return json({ error: 'Skill not found' }, 404);

  const [owner, repo] = skill.slug.split('/');
  const github = new GitHubClient(env.GITHUB_TOKEN);
  const readme = await github.getReadme(owner, repo);

  const search = new SearchClient(env.SERPER_API_KEY);
  const enrichment = await search.enrichSkillInfo(skill.name, skill.author);

  const wiki = await generateWikiContent(
    env.AI,
    readme || '',
    skill.name,
    skill.description,
    skill.language,
    enrichment.snippets
  );

  const now = new Date().toISOString();
  const readmeHash = readme
    ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(readme))))
        .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
    : null;

  await db.upsertSkillContent({
    skill_id: skill.id,
    overview: wiki.overview,
    use_cases: JSON.stringify(wiki.use_cases),
    installation: wiki.installation,
    usage_guide: wiki.usage_guide,
    tips: wiki.tips,
    alternatives: JSON.stringify(wiki.alternatives),
    pros_cons: JSON.stringify(wiki.pros_cons),
    use_case_tags: JSON.stringify(wiki.use_case_tags),
    search_context: JSON.stringify(enrichment.snippets.slice(0, 10)),
    related_links: JSON.stringify(enrichment.relatedLinks.slice(0, 10)),
    generated_at: now,
    source_readme_hash: readmeHash,
  });

  const cache = new CacheClient(env.CACHE);
  await cache.invalidatePattern(`skill:${skill.slug}`);

  return json({ success: true, skill_id: skill.id });
}
