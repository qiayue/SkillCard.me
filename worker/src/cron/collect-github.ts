import { DB } from '../db/queries';
import { GitHubClient } from '../lib/github';
import { SearchClient } from '../lib/search';
import { classifySkill, generateWikiContent } from '../lib/ai';
import type { Env } from '../types';

export async function collectGitHubData(env: Env): Promise<void> {
  const db = new DB(env.DB);
  const github = new GitHubClient(env.GITHUB_TOKEN);
  const search = new SearchClient(env.SERPER_API_KEY);
  const skills = await db.getActiveSkills();
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  console.log(`[collect] Starting data collection for ${skills.length} skills`);

  let successCount = 0;
  let failCount = 0;

  for (const skill of skills) {
    try {
      const [owner, repo] = skill.slug.split('/');
      const data = await github.collectSkillData(owner, repo);
      const ghRepo = data.repo;

      // Check if slug changed (repo renamed/transferred)
      const newSlug = ghRepo.full_name.toLowerCase();
      if (newSlug !== skill.slug) {
        console.log(`[collect] Slug changed: ${skill.slug} → ${newSlug}`);
      }

      // Update skill basic info
      await db.upsertSkill({
        ...skill,
        slug: newSlug,
        github_url: ghRepo.html_url,
        description: ghRepo.description,
        author: ghRepo.owner.login,
        avatar_url: ghRepo.owner.avatar_url,
        homepage_url: ghRepo.homepage,
        license: ghRepo.license?.spdx_id || null,
        language: ghRepo.language,
        topics: JSON.stringify(ghRepo.topics),
        updated_at: now,
      });

      // Check if README changed → regenerate AI content
      const readmeHash = data.readme
        ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data.readme))))
            .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
        : null;

      const existingContent = await env.DB
        .prepare('SELECT source_readme_hash FROM skill_content WHERE skill_id = ?')
        .bind(skill.id)
        .first<{ source_readme_hash: string | null }>();

      const needsRegeneration = !existingContent || existingContent.source_readme_hash !== readmeHash;

      if (needsRegeneration && data.readme) {
        console.log(`[collect] Regenerating AI content for ${skill.slug}`);
        try {
          const enrichment = await search.enrichSkillInfo(skill.name, skill.author);

          const classification = await classifySkill(
            env.AI, data.readme, ghRepo.description, ghRepo.topics, enrichment.snippets
          );

          const wiki = await generateWikiContent(
            env.AI, data.readme, ghRepo.name, ghRepo.description, ghRepo.language, enrichment.snippets
          );

          await db.upsertSkill({
            ...skill,
            slug: newSlug,
            github_url: ghRepo.html_url,
            ai_summary: classification.summary,
            ai_category_reason: classification.reason,
            compatibility: JSON.stringify(classification.compatibility),
            category: classification.category,
            readme_excerpt: data.readme.slice(0, 500),
            updated_at: now,
          });

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
        } catch (aiError) {
          console.error(`[collect] AI generation failed for ${skill.slug}:`, aiError);
          // Continue - don't fail the whole collection
        }
      }

      // Insert daily snapshot
      await db.upsertSnapshot({
        skill_id: skill.id,
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

      successCount++;
    } catch (error) {
      failCount++;
      console.error(`[collect] Failed for ${skill.slug}:`, error);
    }
  }

  console.log(`[collect] Done: ${successCount} success, ${failCount} failed`);
}
