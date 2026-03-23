import type { Env } from '../types';

interface ClassifyResult {
  category: string;
  reason: string;
  compatibility: string[];
  summary: string;
}

interface WikiContent {
  overview: string;
  use_cases: string[];
  installation: string;
  usage_guide: string;
  tips: string;
  pros_cons: { pros: string[]; cons: string[] };
  alternatives: string[];
  use_case_tags: string[];
}

async function runAI(ai: Ai, prompt: string, systemPrompt: string): Promise<string> {
  const response = await ai.run('@cf/meta/llama-3.1-8b-instruct' as BaseAiTextGenerationModels, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    max_tokens: 2048,
  });
  if ('response' in response && typeof response.response === 'string') {
    return response.response;
  }
  return '';
}

function parseJSON<T>(text: string, fallback: T): T {
  // Extract JSON from markdown code blocks if present
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cleaned = jsonMatch ? jsonMatch[1].trim() : text.trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

/** Step 1: Classify and summarize a skill */
export async function classifySkill(
  ai: Ai,
  readme: string,
  repoDescription: string | null,
  topics: string[],
  searchSnippets: string[]
): Promise<ClassifyResult> {
  const context = [
    repoDescription ? `Description: ${repoDescription}` : '',
    `Topics: ${topics.join(', ')}`,
    `README (first 3000 chars):\n${readme.slice(0, 3000)}`,
    searchSnippets.length > 0
      ? `Web search context:\n${searchSnippets.slice(0, 5).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const result = await runAI(
    ai,
    context,
    `You are a classifier for AI Agent Skills (tools/plugins for AI agents like Claude Code, OpenClaw, etc).
Analyze the given information and respond with a JSON object:
{
  "category": one of "web", "document", "coding", "data", "design", "devops", "other",
  "reason": brief explanation of why this category,
  "compatibility": array of compatible platforms, e.g. ["claude-code", "openclaw"],
  "summary": one sentence description of what this skill does (max 150 chars)
}
Respond ONLY with the JSON object, no markdown.`
  );

  return parseJSON<ClassifyResult>(result, {
    category: 'other',
    reason: 'Unable to classify',
    compatibility: [],
    summary: repoDescription || 'An AI agent skill',
  });
}

/** Step 2-4: Generate full wiki content */
export async function generateWikiContent(
  ai: Ai,
  readme: string,
  repoName: string,
  repoDescription: string | null,
  language: string | null,
  searchSnippets: string[]
): Promise<WikiContent> {
  const context = [
    `Skill name: ${repoName}`,
    repoDescription ? `Description: ${repoDescription}` : '',
    language ? `Language: ${language}` : '',
    `README:\n${readme.slice(0, 4000)}`,
    searchSnippets.length > 0
      ? `Web search context:\n${searchSnippets.slice(0, 5).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const result = await runAI(
    ai,
    context,
    `You are a technical writer creating wiki content for an AI Agent Skill.
Based on the provided information, generate a comprehensive JSON:
{
  "overview": "2-3 paragraph detailed description of what this skill does and what problems it solves (Markdown)",
  "use_cases": ["use case 1 description", "use case 2 description", ...],
  "installation": "Step-by-step installation guide with commands (Markdown with code blocks)",
  "usage_guide": "Common usage examples and patterns (Markdown with code blocks)",
  "tips": "Best practices and pro tips (Markdown)",
  "pros_cons": {"pros": ["pro1", "pro2", ...], "cons": ["con1", "con2", ...]},
  "alternatives": ["alternative tool 1", "alternative tool 2"],
  "use_case_tags": ["tag1", "tag2", ...] (lowercase-kebab-case, e.g. "web-scraping", "code-review")
}
Use English. Be specific and actionable. Respond ONLY with the JSON.`
  );

  return parseJSON<WikiContent>(result, {
    overview: repoDescription || 'An AI agent skill.',
    use_cases: [],
    installation: '',
    usage_guide: '',
    tips: '',
    pros_cons: { pros: [], cons: [] },
    alternatives: [],
    use_case_tags: [],
  });
}

/** Check if a repo is actually an AI Agent Skill */
export async function isAgentSkill(
  ai: Ai,
  repoName: string,
  description: string | null,
  topics: string[],
  readmeExcerpt: string
): Promise<boolean> {
  const context = [
    `Repo: ${repoName}`,
    description ? `Description: ${description}` : '',
    `Topics: ${topics.join(', ')}`,
    `README excerpt: ${readmeExcerpt.slice(0, 1500)}`,
  ]
    .filter(Boolean)
    .join('\n');

  const result = await runAI(
    ai,
    context,
    `You determine if a GitHub repo is an AI Agent Skill - a tool, plugin, or extension
that can be used by AI agents (like Claude Code, OpenClaw, MCP servers, etc).
It should be something that extends an AI agent's capabilities.
NOT: general libraries, frameworks, apps, tutorials, or awesome-lists.
Respond with ONLY "yes" or "no".`
  );

  return result.trim().toLowerCase().startsWith('yes');
}
