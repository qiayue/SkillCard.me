import type { GitHubRepo, GitHubCommit, GitHubRelease } from '../types';

export class GitHubClient {
  private token: string;
  private baseUrl = 'https://api.github.com';

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SkillCard/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub API ${path}: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async getRepo(owner: string, repo: string): Promise<GitHubRepo> {
    return this.request<GitHubRepo>(`/repos/${owner}/${repo}`);
  }

  async getRecentCommits(owner: string, repo: string, since?: string): Promise<GitHubCommit[]> {
    const params = new URLSearchParams({ per_page: '1' });
    if (since) params.set('since', since);
    return this.request<GitHubCommit[]>(`/repos/${owner}/${repo}/commits?${params}`);
  }

  async getCommitCount30d(owner: string, repo: string): Promise<number> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const params = new URLSearchParams({ since, per_page: '1' });
    const res = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/commits?${params}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SkillCard/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) return 0;
    // Parse Link header for total count
    const link = res.headers.get('Link');
    if (!link) {
      const data = await res.json() as GitHubCommit[];
      return Array.isArray(data) ? data.length : 0;
    }
    const match = link.match(/page=(\d+)>; rel="last"/);
    return match ? parseInt(match[1], 10) : 1;
  }

  async getContributorCount(owner: string, repo: string): Promise<number> {
    const params = new URLSearchParams({ per_page: '1', anon: 'true' });
    const res = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/contributors?${params}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SkillCard/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) return 0;
    const link = res.headers.get('Link');
    if (!link) {
      const data = await res.json() as unknown[];
      return Array.isArray(data) ? data.length : 0;
    }
    const match = link.match(/page=(\d+)>; rel="last"/);
    return match ? parseInt(match[1], 10) : 1;
  }

  async getLatestRelease(owner: string, repo: string): Promise<GitHubRelease | null> {
    try {
      const releases = await this.request<GitHubRelease[]>(
        `/repos/${owner}/${repo}/releases?per_page=1`
      );
      return releases.length > 0 ? releases[0] : null;
    } catch {
      return null;
    }
  }

  async getReadme(owner: string, repo: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/readme`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.raw+json',
          'User-Agent': 'SkillCard/1.0',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (!res.ok) return null;
      return res.text();
    } catch {
      return null;
    }
  }

  async getClosedIssueCount(owner: string, repo: string): Promise<number> {
    const params = new URLSearchParams({ state: 'closed', per_page: '1' });
    const res = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/issues?${params}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SkillCard/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) return 0;
    const link = res.headers.get('Link');
    if (!link) {
      const data = await res.json() as unknown[];
      return Array.isArray(data) ? data.length : 0;
    }
    const match = link.match(/page=(\d+)>; rel="last"/);
    return match ? parseInt(match[1], 10) : 1;
  }

  async searchRepos(query: string, perPage = 30): Promise<GitHubRepo[]> {
    const params = new URLSearchParams({ q: query, per_page: String(perPage), sort: 'updated' });
    const res = await fetch(`${this.baseUrl}/search/repositories?${params}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SkillCard/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) return [];
    const data = await res.json() as { items: GitHubRepo[] };
    return data.items || [];
  }

  /** Collect all data for a single skill */
  async collectSkillData(owner: string, repo: string) {
    const [repoData, commits30d, contributors, latestRelease, closedIssues, readme] =
      await Promise.all([
        this.getRepo(owner, repo),
        this.getCommitCount30d(owner, repo),
        this.getContributorCount(owner, repo),
        this.getLatestRelease(owner, repo),
        this.getClosedIssueCount(owner, repo),
        this.getReadme(owner, repo),
      ]);

    const totalIssues = repoData.open_issues_count + closedIssues;
    const issueCloseRate = totalIssues > 0 ? closedIssues / totalIssues : 0;

    return {
      repo: repoData,
      commits_last_30d: commits30d,
      contributors,
      latest_release: latestRelease,
      closed_issues: closedIssues,
      issue_close_rate: issueCloseRate,
      readme,
    };
  }
}
