import type { SerperResponse, SerperResult } from '../types';

export class SearchClient {
  private apiKey: string;
  private baseUrl = 'https://google.serper.dev/search';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, num = 10): Promise<SerperResult[]> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num }),
    });
    if (!res.ok) {
      throw new Error(`Serper API: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as SerperResponse;
    return data.organic || [];
  }

  /** Search for GitHub repos matching skill-related queries */
  async discoverSkillRepos(queries: string[]): Promise<string[]> {
    const githubUrls = new Set<string>();

    for (const query of queries) {
      try {
        const results = await this.search(query, 10);
        for (const r of results) {
          const match = r.link.match(/github\.com\/([^/]+\/[^/]+)/);
          if (match) {
            githubUrls.add(match[1].toLowerCase());
          }
        }
      } catch {
        // Skip failed queries
      }
    }

    return [...githubUrls];
  }

  /** Search for supplementary info about a specific skill */
  async enrichSkillInfo(skillName: string, author: string): Promise<{
    snippets: string[];
    relatedLinks: { title: string; url: string }[];
  }> {
    const queries = [
      `"${skillName}" ${author} claude code skill`,
      `"${skillName}" AI agent skill tutorial review`,
    ];

    const snippets: string[] = [];
    const relatedLinks: { title: string; url: string }[] = [];

    for (const query of queries) {
      try {
        const results = await this.search(query, 5);
        for (const r of results) {
          snippets.push(`${r.title}: ${r.snippet}`);
          if (!r.link.includes('github.com')) {
            relatedLinks.push({ title: r.title, url: r.link });
          }
        }
      } catch {
        // Skip failed queries
      }
    }

    return { snippets, relatedLinks };
  }
}
