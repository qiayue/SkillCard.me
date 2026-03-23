/**
 * Seed script - imports initial skills via the admin API.
 *
 * Usage:
 *   ADMIN_API_KEY=xxx API_URL=http://localhost:8787 npx tsx scripts/seed.ts
 */

const API_URL = process.env.API_URL || 'http://localhost:8787';
const API_KEY = process.env.ADMIN_API_KEY || '';

const SEED_URLS = [
  // Add known skill GitHub URLs here
  'https://github.com/anthropics/skills',
  // Add more as you discover them
];

async function main() {
  if (!API_KEY) {
    console.error('Set ADMIN_API_KEY environment variable');
    process.exit(1);
  }

  console.log(`Seeding ${SEED_URLS.length} skills to ${API_URL}`);

  const res = await fetch(`${API_URL}/api/admin/skills/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      urls: SEED_URLS,
      source_type: 'manual',
      source_url: 'seed-script',
    }),
  });

  const data = await res.json();
  console.log('Result:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
