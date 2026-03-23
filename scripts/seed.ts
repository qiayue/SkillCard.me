/**
 * Seed script - imports initial skills via the admin API.
 *
 * Usage:
 *   ADMIN_API_KEY=xxx API_URL=http://localhost:8787 npx tsx scripts/seed.ts
 */

const API_URL = process.env.API_URL || 'http://localhost:8787';
const API_KEY = process.env.ADMIN_API_KEY || '';

const SEED_URLS = [
  // ─── Official / Reference Implementations ──────────────
  'https://github.com/modelcontextprotocol/servers',
  'https://github.com/github/github-mcp-server',
  'https://github.com/microsoft/playwright-mcp',
  'https://github.com/awslabs/mcp',
  'https://github.com/docker/hub-mcp',
  'https://github.com/docker/mcp-gateway',

  // ─── Database MCP Servers ──────────────────────────────
  'https://github.com/bytebase/dbhub',
  'https://github.com/runekaagaard/mcp-alchemy',
  'https://github.com/FreePeak/db-mcp-server',
  'https://github.com/MariaDB/mcp',
  'https://github.com/jparkerweb/mcp-sqlite',
  'https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server',
  'https://github.com/executeautomation/mcp-database-server',

  // ─── Browser Automation & Playwright ───────────────────
  'https://github.com/executeautomation/mcp-playwright',
  'https://github.com/VikashLoomba/MCP-Server-Playwright',
  'https://github.com/badchars/mcp-browser',
  'https://github.com/sumyapp/playwright-parallel-mcp',

  // ─── File System & Operations ──────────────────────────
  'https://github.com/mark3labs/mcp-filesystem-server',
  'https://github.com/cyanheads/filesystem-mcp-server',
  'https://github.com/calebmwelsh/file-system-mcp-server',

  // ─── Web Scraping & Fetch ─────────────────────────────
  'https://github.com/firecrawl/firecrawl-mcp-server',
  'https://github.com/zcaceres/fetch-mcp',
  'https://github.com/MaitreyaM/WEB-SCRAPING-MCP',
  'https://github.com/cyberchitta/scrapling-fetch-mcp',
  'https://github.com/sigmaSd/scrap-mcp',

  // ─── Git & Version Control ────────────────────────────
  'https://github.com/cyanheads/git-mcp-server',
  'https://github.com/idosal/git-mcp',

  // ─── Memory & Knowledge Graph ─────────────────────────
  'https://github.com/shaneholloman/mcp-knowledge-graph',
  'https://github.com/doobidoo/mcp-memory-service',
  'https://github.com/okooo5km/memory-mcp-server',
  'https://github.com/DeusData/codebase-memory-mcp',

  // ─── Vector Database & Embeddings ─────────────────────
  'https://github.com/chroma-core/chroma-mcp',
  'https://github.com/qdrant/mcp-server-qdrant',
  'https://github.com/zilliztech/mcp-server-milvus',

  // ─── Communication & Slack ────────────────────────────
  'https://github.com/korotovsky/slack-mcp-server',
  'https://github.com/ubie-oss/slack-mcp-server',

  // ─── Docker & DevOps ──────────────────────────────────
  'https://github.com/ckreiling/mcp-server-docker',
  'https://github.com/QuantGeekDev/docker-mcp',

  // ─── Code Analysis & Security ─────────────────────────
  'https://github.com/hyperb1iss/lucidity-mcp',
  'https://github.com/invariantlabs-ai/mcp-scan',
  'https://github.com/anselmoo/mcp-server-analyzer',

  // ─── Sequential Thinking & Reasoning ──────────────────
  'https://github.com/FradSer/mcp-server-mas-sequential-thinking',
  'https://github.com/spences10/mcp-sequentialthinking-tools',

  // ─── Task Management ──────────────────────────────────
  'https://github.com/greirson/mcp-todoist',
  'https://github.com/abhiz123/todoist-mcp-server',

  // ─── AWS Cloud ─────────────────────────────────────────
  'https://github.com/alexei-led/aws-mcp-server',
  'https://github.com/rishikavikondala/mcp-server-aws',

  // ─── Search & Retrieval ───────────────────────────────
  'https://github.com/ItzCrazyKns/Perplexica',
  'https://github.com/SciPhi-AI/agent-search',

  // ─── Claude Code Skills & Slash Commands ──────────────
  'https://github.com/alirezarezvani/claude-skills',
  'https://github.com/daymade/claude-code-skills',
  'https://github.com/levnikolaevich/claude-code-skills',
  'https://github.com/glebis/claude-skills',
  'https://github.com/qdhenry/Claude-Command-Suite',
  'https://github.com/wshobson/commands',
  'https://github.com/alirezarezvani/claude-code-skill-factory',
  'https://github.com/Jeffallan/claude-skills',
  'https://github.com/FrancyJGLisboa/agent-skill-creator',
  'https://github.com/K-Dense-AI/claude-scientific-skills',
  'https://github.com/danielrosehill/Claude-Slash-Commands',
  'https://github.com/artemgetmann/claude-slash-commands',

  // ─── AI Agent Frameworks & Tools ──────────────────────
  'https://github.com/kortix-ai/suna',
  'https://github.com/unclecode/crawl4ai',
  'https://github.com/ScrapeGraphAI/Scrapegraph-ai',
  'https://github.com/vanna-ai/vanna',
  'https://github.com/eosphoros-ai/DB-GPT',
  'https://github.com/Canner/WrenAI',
  'https://github.com/mindsdb/mindsdb',
];

const AWESOME_LIST_URLS = [
  // These will be parsed by the awesome-list parser cron job
  'https://github.com/punkpeye/awesome-mcp-servers',
  'https://github.com/wong2/awesome-mcp-servers',
  'https://github.com/appcypher/awesome-mcp-servers',
  'https://github.com/hesreallyhim/awesome-claude-code',
  'https://github.com/jqueryscript/awesome-claude-code',
  'https://github.com/rohitg00/awesome-claude-code-toolkit',
  'https://github.com/BehiSecc/awesome-claude-skills',
  'https://github.com/ComposioHQ/awesome-claude-skills',
  'https://github.com/travisvn/awesome-claude-skills',
  'https://github.com/TensorBlock/awesome-mcp-servers',
  'https://github.com/rohitg00/awesome-devops-mcp-servers',
  'https://github.com/AlexMili/Awesome-MCP',
  'https://github.com/VoltAgent/awesome-claude-code-subagents',
  'https://github.com/heilcheng/awesome-agent-skills',
  'https://github.com/skillmatic-ai/awesome-agent-skills',
  'https://github.com/PipedreamHQ/awesome-mcp-servers',
  'https://github.com/ever-works/awesome-mcp-servers',
  'https://github.com/pascalporedda/awesome-claude-code',
];

async function submitBatch(urls: string[], sourceType: string, label: string) {
  console.log(`\n[${label}] Submitting ${urls.length} URLs...`);

  // Process in batches of 10 to avoid timeout
  const batchSize = 10;
  let totalSuccess = 0;
  let totalFailed = 0;

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    console.log(`  Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} URLs`);

    const res = await fetch(`${API_URL}/api/admin/skills/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({
        urls: batch,
        source_type: sourceType,
        source_url: 'seed-script',
      }),
    });

    const data = (await res.json()) as { success: number; failed: number; results: unknown[] };
    totalSuccess += data.success;
    totalFailed += data.failed;
    console.log(`  → ${data.success} success, ${data.failed} failed`);

    // Small delay between batches to be nice to APIs
    if (i + batchSize < urls.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log(`[${label}] Done: ${totalSuccess} success, ${totalFailed} failed`);
}

async function main() {
  if (!API_KEY) {
    console.error('Set ADMIN_API_KEY environment variable');
    process.exit(1);
  }

  console.log(`Seeding to ${API_URL}`);
  console.log(`Total: ${SEED_URLS.length} skills + ${AWESOME_LIST_URLS.length} awesome-lists\n`);

  // Step 1: Import direct skill URLs
  await submitBatch(SEED_URLS, 'manual', 'Direct Skills');

  // Step 2: Import awesome-list repos (they will be parsed for more skills)
  await submitBatch(AWESOME_LIST_URLS, 'awesome_list', 'Awesome Lists');

  console.log('\n✓ Seeding complete!');
  console.log('Next steps:');
  console.log('  1. Run the discover-skills cron to find more skills from awesome-lists');
  console.log('  2. Run the calculate-scores cron to generate scores');
  console.log('  3. Trigger a Pages rebuild to update the frontend');
}

main().catch(console.error);
