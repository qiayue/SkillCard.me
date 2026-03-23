import type { Env } from './types';
import { handleSkillsList, handleSkillDetail, handleSkillHistory } from './routes/skills';
import { handleTrending } from './routes/trending';
import { handleCategories } from './routes/categories';
import { handleStats } from './routes/stats';
import {
  handleAdminSubmit,
  handleAdminBatchSubmit,
  handleAdminDelete,
  handleAdminRefresh,
  handleAdminRegenerate,
} from './routes/admin';
import { collectGitHubData } from './cron/collect-github';
import { calculateAllScores } from './cron/calculate-scores';
import { discoverNewSkills } from './cron/discover-skills';

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Public API routes
      if (path === '/api/skills' && request.method === 'GET') {
        return handleSkillsList(request, env);
      }

      if (path === '/api/trending' && request.method === 'GET') {
        return handleTrending(env);
      }

      if (path === '/api/categories' && request.method === 'GET') {
        return handleCategories(env);
      }

      if (path === '/api/stats' && request.method === 'GET') {
        return handleStats(env);
      }

      // Skill detail: /api/skills/:slug (slug can contain /)
      const skillDetailMatch = path.match(/^\/api\/skills\/([^/]+\/[^/]+)$/);
      if (skillDetailMatch && request.method === 'GET') {
        return handleSkillDetail(skillDetailMatch[1], env);
      }

      // Skill history: /api/skills/:slug/history
      const skillHistoryMatch = path.match(/^\/api\/skills\/([^/]+\/[^/]+)\/history$/);
      if (skillHistoryMatch && request.method === 'GET') {
        return handleSkillHistory(skillHistoryMatch[1], request, env);
      }

      // Admin routes
      if (path === '/api/admin/skills' && request.method === 'POST') {
        return handleAdminSubmit(request, env);
      }

      if (path === '/api/admin/skills/batch' && request.method === 'POST') {
        return handleAdminBatchSubmit(request, env);
      }

      const adminDeleteMatch = path.match(/^\/api\/admin\/skills\/(\d+)$/);
      if (adminDeleteMatch && request.method === 'DELETE') {
        return handleAdminDelete(adminDeleteMatch[1], request, env);
      }

      if (path === '/api/admin/refresh' && request.method === 'POST') {
        return handleAdminRefresh(request, env);
      }

      const adminRegenMatch = path.match(/^\/api\/admin\/regenerate\/(\d+)$/);
      if (adminRegenMatch && request.method === 'POST') {
        return handleAdminRegenerate(adminRegenMatch[1], request, env);
      }

      // Health check
      if (path === '/api/health') {
        return json({ status: 'ok', timestamp: new Date().toISOString() });
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('Request error:', error);
      return json(
        { error: error instanceof Error ? error.message : 'Internal server error' },
        500
      );
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    switch (event.cron) {
      case '0 2 * * *':
        // Daily data collection + AI processing
        ctx.waitUntil(collectGitHubData(env));
        break;
      case '0 3 * * *':
        // Score calculation + trigger rebuild
        ctx.waitUntil(calculateAllScores(env));
        break;
      case '0 6 * * *':
        // Discover new skills
        ctx.waitUntil(discoverNewSkills(env));
        break;
      default:
        console.log(`Unknown cron: ${event.cron}`);
    }
  },
};
