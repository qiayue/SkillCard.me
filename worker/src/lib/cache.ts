const DEFAULT_TTL = 3600; // 1 hour

export class CacheClient {
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  async get<T>(key: string): Promise<T | null> {
    const data = await this.kv.get(key, 'json');
    return data as T | null;
  }

  async set<T>(key: string, value: T, ttl = DEFAULT_TTL): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), { expirationTtl: ttl });
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async invalidatePattern(prefix: string): Promise<void> {
    const list = await this.kv.list({ prefix });
    for (const key of list.keys) {
      await this.kv.delete(key.name);
    }
  }

  // Pre-defined cache keys
  static keys = {
    skillsList: (page: number, category: string, sort: string) =>
      `skills:${category}:${sort}:p${page}`,
    skillDetail: (slug: string) => `skill:${slug}`,
    trending: () => 'trending',
    categories: () => 'categories',
    stats: () => 'stats',
  };
}
