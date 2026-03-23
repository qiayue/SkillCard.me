import { DB } from '../db/queries';
import { GitHubClient } from '../lib/github';
import { SearchClient } from '../lib/search';
import { classifySkill, generateWikiContent, isAgentSkill } from '../lib/ai';
import type { Env } from '../types';

const GITHUB_SEARCH_QUERIES = [
  'topic:claude-code-skill',
  'topic:agent-skill',
  'topic:claude-skill',
  'topic:mcp-server',
  '"claude code skill" in:readme',
  '"MCP server" in:readme fork:false',
];

const SERPER_DISCOVERY_QUERIES = [
  '"claude code skill" site:github.com',
  '"MCP server" claude site:github.com',
  '"agent skill" claude-code site:github.com',
  'awesome claude code skills site:github.com',
];

export async function discoverNewSkills(env: Env): Promise<void> {
  const db = new DB(env.DB);
  const github = new GitHubClient(env.GITHUB_TOKEN);
  const search = new SearchClient(env.SERPER_API_KEY);

  console.log('[discover] Starting skill discovery');

  const candidateSlugs = new Set<string>();

  // Channel 1: GitHub Search
  for (const query of GITHUB_SEARCH_QUERIES) {
    try {
      const repos = await github.searchRepos(query, 20);
      for (const repo of repos) {
        candidateSlugs.add(repo.full_name.toLowerCase());
      }
    } catch (error) {
      console.error(`[discover] GitHub search failed for "${query}":`, error);
    }
  }

  // Channel 2: Google Search via Serper
  const serperSlugs = await search.discoverSkillRepos(SERPER_DISCOVERY_QUERIES);
  for (const slug of serperSlugs) {
    candidateSlugs.add(slug.toLowerCase());
  }

  console.log(`[discover] Found ${candidateSlugs.size} candidate repos`);

  let newCount = 0;
  let skippedCount = 0;
  let filteredCount = 0;

  for (const slug of candidateSlugs) {
    try {
      const [owner, repo] = slug.split('/');
      if (!owner || !repo) continue;

      // Get repo to check ID
      let ghRepo;
      try {
        ghRepo = await github.getRepo(owner, repo);
      } catch {
        continue; // Skip if repo doesn't exist
      }

      // Check if already exists
      if (await db.skillExists(ghRepo.id)) {
        skippedCount++;
        continue;
      }

      // AI filter: is this actually an agent skill?
      const readme = await github.getReadme(owner, repo);
      const isSkill = await isAgentSkill(
        env.AI,
        ghRepo.name,
        ghRepo.description,
        ghRepo.topics,
        (readme || '').slice(0, 1500)
      );

      if (!isSkill) {
        filteredCount++;
        continue;
      }

      console.log(`[discover] New skill found: ${slug}`);

      // Enrich with search
      const enrichment = await search.enrichSkillInfo(ghRepo.name, ghRepo.owner.login);

      // AI classify and generate content
      const classification = await classifySkill(
        env.AI,
        readme || '',
        ghRepo.description,
        ghRepo.topics,
        enrichment.snippets
      );

      const wiki = await generateWikiContent(
        env.AI,
        readme || '',
        ghRepo.name,
        ghRepo.description,
        ghRepo.language,
        enrichment.snippets
      );

      const now = new Date().toISOString();

      // Insert skill
      await db.upsertSkill({
        id: ghRepo.id,
        slug: ghRepo.full_name.toLowerCase(),
        github_url: ghRepo.html_url,
        name: ghRepo.name,
        description: ghRepo.description,
        ai_summary: classification.summary,
        ai_category_reason: classification.reason,
        author: ghRepo.owner.login,
        avatar_url: ghRepo.owner.avatar_url,
        homepage_url: ghRepo.homepage,
        license: ghRepo.license?.spdx_id || null,
        language: ghRepo.language,
        topics: JSON.stringify(ghRepo.topics),
        readme_excerpt: (readme || '').slice(0, 500),
        compatibility: JSON.stringify(classification.compatibility),
        category: classification.category,
        status: 'active',
        created_at: ghRepo.created_at,
        updated_at: now,
      });

      // Insert content
      const readmeHash = readme
        ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(readme))))
            .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
        : null;

      await db.upsertSkillContent({
        skill_id: ghRepo.id,
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

      // Record source
      await db.addSkillSource({
        skill_id: ghRepo.id,
        source_type: 'github_search',
        source_url: ghRepo.html_url,
        discovered_at: now,
      });

      // Insert initial snapshot
      const data = await github.collectSkillData(owner, repo);
      const today = now.split('T')[0];
      await db.upsertSnapshot({
        skill_id: ghRepo.id,
        date: today,
        stars: ghRepo.stargazers_count,
        forks: ghRepo.forks_count,
        open_issues: ghRepo.open_issues_count,
        closed_issues: data.closed_issues,
        watchers: ghRepo.watchers_count,
        contributors: data.contributors,
        commits_last_30d: data.commits_last_30d,
        last_commit_at: ghRepo.pushed_at,
        last_release_at: data.latest_release?.published_at || null,
        issue_close_rate: data.issue_close_rate,
        mentions_twitter: 0,
        mentions_reddit: 0,
        overall_score: 0,
        raw_github_data: JSON.stringify(ghRepo),
      });

      newCount++;
    } catch (error) {
      console.error(`[discover] Failed for ${slug}:`, error);
    }
  }

  console.log(
    `[discover] Done: ${newCount} new, ${skippedCount} existing, ${filteredCount} filtered out`
  );
}
