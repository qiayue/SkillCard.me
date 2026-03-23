# SkillCard.me — AI Agent Skill 自动评测平台

> 域名：skillcard.me
> 全自动运转，零人工干预，数据驱动排名

---

## 一、项目定位

SkillCard 是一个 **全自动化** 的 AI Agent Skill 评测与发现平台。

核心理念：**不依赖用户手动打分**，通过自动采集 GitHub 数据、社媒传播信号、兼容性测试等客观指标，生成每个 Skill 的评分和排名。网站内容由定时任务驱动更新，全程无需人工干预。

**Title**: SkillCard - AI Agent Skill Reviews & Ratings
**H1**: AI Agent Skill Discovery & Ratings

---

## 二、技术架构

### 全栈 Cloudflare，不依赖传统服务器

```
┌──────────────────────────────────────────────────────────────────┐
│                       Cloudflare 全家桶                            │
│                                                                  │
│  ┌──────────────────┐    ┌─────────────────────────────────────┐ │
│  │  Cloudflare Pages │    │  Cloudflare Workers                 │ │
│  │  (前端静态站)      │◄───│  (API + 定时任务)                    │ │
│  │  skillcard.me     │    │                                     │ │
│  └──────────────────┘    │  ┌─────────────────────────────┐    │ │
│                          │  │ Cron Trigger (每日)          │    │ │
│                          │  │ - GitHub 数据采集             │    │ │
│                          │  │ - Google 搜索发现 & 信息补充   │    │ │
│                          │  │ - AI 分类 & Wiki 内容生成     │    │ │
│                          │  │ - 评分计算                   │    │ │
│                          │  │ - 新 Skill 自动发现           │    │ │
│                          │  │ - 社媒信号采集 (V2)           │    │ │
│                          │  └─────────────────────────────┘    │ │
│                          └──────────┬──────────────────────────┘ │
│                                     │                            │
│  ┌──────────────────────────────────▼──────────────────────────┐ │
│  │                     外部服务                                  │ │
│  │                                                              │ │
│  │  ┌─────────────────────┐  ┌────────────────────────────┐    │ │
│  │  │  Workers AI          │  │  Serper.dev (Google Search) │    │ │
│  │  │  - Skill 自动分类    │  │  - 搜索发现新 Skill          │    │ │
│  │  │  - Wiki 内容生成     │  │  - 搜索补充 Skill 信息       │    │ │
│  │  │  - 兼容性判断        │  │  - 查找教程/讨论/评价        │    │ │
│  │  │  - Agent Skill 过滤  │  │  - 验证作者信息             │    │ │
│  │  └─────────────────────┘  └────────────────────────────┘    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌───────────────────────────────┐                               │
│  │  D1 (SQLite 数据库)            │                               │
│  │  - skills 表                   │                               │
│  │  │  - skill_content 表         │                               │
│  │  │  - daily_snapshots 表       │                               │
│  │  │  - scores 表                │                               │
│  │  └───────────────────────────┘                               │
│                                                                  │
│  ┌───────────────────────────────┐                               │
│  │  KV (缓存层)                   │                               │
│  │  - 首页数据缓存                │                               │
│  │  - API 响应缓存                │                               │
│  └───────────────────────────────┘                               │
└──────────────────────────────────────────────────────────────────┘
```

### 技术选型

| 层级 | 选型 | 说明 |
|------|------|------|
| 前端 | Cloudflare Pages + Astro (SSG) | 每日构建一次，纯静态，极速加载 |
| API | Cloudflare Workers | 提供 REST API，同时负责定时任务 |
| 数据库 | Cloudflare D1 (SQLite) | 结构化数据存储，免费 5GB |
| 缓存 | Cloudflare KV | 热数据缓存，减少 D1 查询 |
| AI 能力 | Workers AI (@cf/meta/llama-3.1-8b-instruct) | Skill 自动分类、Wiki 内容生成、兼容性判断 |
| 搜索 | Serper.dev (Google Search API) | 搜索发现新 Skill、补充信息、查找教程和讨论 |
| 定时任务 | Workers Cron Triggers | 每天自动执行数据采集、搜索补充、AI 处理和评分计算 |
| 部署 | Wrangler CLI | 一键部署 Workers + Pages |

---

## 三、数据模型

### 3.1 skills 表（Skill 基础信息）

```sql
CREATE TABLE skills (
  id INTEGER PRIMARY KEY,                 -- GitHub repo_id（整数，仓库转移/重命名后不变）
  slug TEXT NOT NULL UNIQUE,              -- owner/repo 格式，用于 URL 路由，采集时自动更新
  github_url TEXT NOT NULL,               -- GitHub 仓库地址
  name TEXT NOT NULL,                     -- Skill 名称
  description TEXT,                       -- GitHub 原始简介
  ai_summary TEXT,                        -- AI 生成的一句话描述（面向用户展示）
  ai_category_reason TEXT,                -- AI 分类的理由（便于调试和人工复核）
  author TEXT NOT NULL,                   -- 作者（GitHub username）
  avatar_url TEXT,                        -- 作者头像
  homepage_url TEXT,                      -- 项目主页（如有）
  license TEXT,                           -- 开源协议
  language TEXT,                          -- 主要编程语言
  topics TEXT,                            -- GitHub topics, JSON 数组
  readme_excerpt TEXT,                    -- README 前 500 字摘要
  compatibility TEXT DEFAULT '[]',        -- AI 判断的兼容平台, JSON 数组 ["claude-code","openclaw"]
  category TEXT DEFAULT 'other',          -- AI 自动分类: web, document, coding, data, design, devops, other
  status TEXT DEFAULT 'active',           -- active / archived / pending
  first_seen_at TEXT NOT NULL,            -- 首次入库时间
  created_at TEXT NOT NULL,               -- GitHub 仓库创建时间
  updated_at TEXT NOT NULL                -- 最后更新时间
);

CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_skills_status ON skills(status);
```

### 3.2 daily_snapshots 表（每日数据快照）

```sql
CREATE TABLE daily_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL,
  date TEXT NOT NULL,                     -- YYYY-MM-DD
  -- GitHub 指标
  stars INTEGER DEFAULT 0,
  forks INTEGER DEFAULT 0,
  open_issues INTEGER DEFAULT 0,
  closed_issues INTEGER DEFAULT 0,
  watchers INTEGER DEFAULT 0,
  contributors INTEGER DEFAULT 0,
  -- 活跃度指标
  commits_last_30d INTEGER DEFAULT 0,     -- 最近 30 天 commit 数
  last_commit_at TEXT,                    -- 最近一次 commit 时间
  last_release_at TEXT,                   -- 最近一次 release 时间
  issue_close_rate REAL DEFAULT 0,        -- Issue 关闭率 (0-1)
  -- 社媒信号 (V2 采集，V1 默认 0)
  mentions_twitter INTEGER DEFAULT 0,     -- Twitter/X 提及数
  mentions_reddit INTEGER DEFAULT 0,      -- Reddit 提及数
  -- 当日计算评分（保留历史，用于趋势计算）
  overall_score REAL DEFAULT 0,           -- 当日综合评分
  -- 原始 JSON 备份
  raw_github_data TEXT,                   -- GitHub API 原始返回, JSON
  UNIQUE(skill_id, date),
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE INDEX idx_snapshots_skill_date ON daily_snapshots(skill_id, date);
```

### 3.3 scores 表（计算后的评分）

```sql
CREATE TABLE scores (
  skill_id INTEGER PRIMARY KEY,
  -- 四个维度评分 (0-100)
  popularity_score REAL DEFAULT 0,        -- 热度: Star 数 + Star 增速 + 社媒提及
  activity_score REAL DEFAULT 0,          -- 活跃度: Commit 频率 + Issue 响应 + 最近更新
  maturity_score REAL DEFAULT 0,          -- 成熟度: 总 Star + Contributors + 文档完整度
  momentum_score REAL DEFAULT 0,          -- 势头: 近 7 天 Star 增量 + 近 7 天社媒增量
  -- 综合评分
  overall_score REAL DEFAULT 0,           -- 加权综合分
  -- 排名
  rank_overall INTEGER,
  rank_category INTEGER,                  -- 分类内排名
  -- 趋势
  trend TEXT DEFAULT 'stable',            -- rising / stable / declining
  trend_delta REAL DEFAULT 0,             -- 相比上周综合分变化
  -- 时间
  calculated_at TEXT NOT NULL,
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);
```

### 3.4 skill_content 表（AI 生成的 Wiki 内容）

```sql
CREATE TABLE skill_content (
  skill_id INTEGER PRIMARY KEY,
  -- AI 生成的详细内容（Markdown 格式）
  overview TEXT,                           -- 详细介绍（2-3 段，说明 Skill 是什么、解决什么问题）
  use_cases TEXT,                          -- 使用场景（JSON 数组: ["场景1描述", "场景2描述", ...]）
  installation TEXT,                       -- 安装方法（step-by-step，含命令）
  usage_guide TEXT,                        -- 使用指南（常用用法示例）
  tips TEXT,                               -- 使用技巧和最佳实践
  alternatives TEXT,                       -- 类似工具/替代品（JSON 数组）
  pros_cons TEXT,                          -- 优缺点分析（JSON: {pros: [...], cons: [...]}）
  -- 用途标签（用于按用途分类页面）
  use_case_tags TEXT DEFAULT '[]',         -- JSON 数组 ["web-scraping", "code-review", "doc-writing", ...]
  -- 外部搜索补充信息（AI 生成时的参考素材）
  search_context TEXT,                     -- Serper 搜索结果摘要（JSON），用于丰富 Wiki 内容
  related_links TEXT DEFAULT '[]',         -- 相关教程/讨论链接（JSON 数组）
  -- 元数据
  generated_at TEXT NOT NULL,              -- AI 生成时间
  source_readme_hash TEXT,                 -- 生成时 README 的 hash，变更时重新生成
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE INDEX idx_skill_content_tags ON skill_content(use_case_tags);
```

### 3.5 skill_sources 表（Skill 来源追踪）

```sql
CREATE TABLE skill_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL,
  source_type TEXT NOT NULL,              -- 'github_search' / 'google_search' / 'awesome_list' / 'manual' / 'social_media'
  source_url TEXT,                        -- 来源 URL（如 awesome-list 仓库地址、社媒帖子链接）
  discovered_at TEXT NOT NULL,
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);
```

---

## 四、自动化任务（Cron Workers）

### 4.1 每日数据采集 — 每天 UTC 02:00

**任务流程：**

```
1. 从 D1 读取所有 active 状态的 skills
2. 批量调用 GitHub API，采集每个 Skill 的：
   - GET /repos/{owner}/{repo}          → stars, forks, open_issues, watchers, license, topics
   - GET /repos/{owner}/{repo}/commits  → 最近 commit 时间, 30 天内 commit 数
   - GET /repos/{owner}/{repo}/contributors → contributors 数量
   - GET /repos/{owner}/{repo}/releases → 最近 release 时间
3. 检测仓库 owner/repo 是否变更（转移/重命名），若变更则更新 slug
4. 调用 Serper.dev Google Search 补充信息（仅对新入库或需更新的 Skill）：
   - 搜索 "{skill_name} claude code skill" / "{skill_name} MCP server"
   - 搜索 "{skill_name} tutorial" / "{skill_name} review"
   - 提取：教程链接、社区讨论、使用评价、作者更多信息
   - 搜索结果作为 AI 生成 Wiki 内容的补充素材
5. 调用 Workers AI 处理（仅对新入库或 README 有更新的 Skill）：
   - 输入：GitHub README + Serper 搜索结果摘要
   - 生成一句话 AI 摘要 → ai_summary
   - 自动判断分类 → category + ai_category_reason
   - 解析 README 提取兼容性信息 → compatibility
   - 生成完整 Wiki 内容 → skill_content 表
     （overview / use_cases / installation / usage_guide / tips / pros_cons / use_case_tags）
6. 写入 daily_snapshots 表
7. 触发评分计算，将 overall_score 同步写入 daily_snapshots
8. 刷新 KV 缓存
```

**容错机制：**
- 单个 Skill 采集失败不中断整批，记录失败列表
- 失败的 Skill 在下次采集时优先重试
- 连续失败超过 3 天的 Skill 标记为 `status = 'pending'` 待人工检查

**GitHub API 注意事项：**
- 需要一个 GitHub Personal Access Token（存在 Workers Secrets 中）
- 免费额度: 5000 次/小时，足够覆盖数百个 Skill
- 使用条件请求（If-None-Match）节省配额

**Serper.dev Google Search API 注意事项：**
- API Key 存在 Workers Secrets 中（SERPER_API_KEY）
- 接口：`POST https://google.serper.dev/search`，Header: `X-API-KEY`
- 每次请求消耗 1 credit，返回 Google 搜索结果（title/link/snippet）
- 用途一：搜索补充 Skill 信息（教程、评价、作者信息）
- 用途二：发现新 Skill（`site:github.com` 限定搜索）
- 搜索结果摘要存入 `skill_content.search_context`，作为 AI 生成 Wiki 的输入素材

**AI Wiki 内容生成流程：**
```
输入素材:
  1. GitHub README 全文
  2. GitHub 仓库元信息（topics, description, language, license）
  3. Serper 搜索结果（2-3 次搜索的 snippet 汇总）

→ Workers AI 分步生成:
  Step 1: 判断分类 + 提取兼容性 → category, compatibility
  Step 2: 生成概述 + 使用场景 → overview, use_cases, use_case_tags
  Step 3: 生成安装指南 + 使用方法 + 技巧 → installation, usage_guide, tips
  Step 4: 生成优缺点 + 替代品 → pros_cons, alternatives

→ 输出: 完整的 Wiki 页面内容，存入 skill_content 表
```

### 4.2 评分计算 — 紧跟数据采集后执行

**评分公式：**

```javascript
// 热度 Popularity (0-100)
// 反映当前受关注程度
// V1: 不采集社媒数据，权重全部分配给 GitHub 指标
// V2: 加入社媒后调整为 stars*0.4 + forks*0.2 + mentions*0.3 + watchers*0.1
popularity = normalize(
  stars * 0.5 +
  forks * 0.3 +
  watchers * 0.2
)

// 活跃度 Activity (0-100)
// 反映维护状态
activity = normalize(
  commits_last_30d * 0.35 +
  issue_close_rate * 0.25 +
  recency_factor(last_commit_at) * 0.3 +  // 越近分越高，指数衰减
  has_recent_release * 0.1
)

// 成熟度 Maturity (0-100)
// 反映项目质量和完善度
maturity = normalize(
  log(stars + 1) * 0.25 +
  contributors * 0.25 +
  has_license * 0.1 +
  readme_length_score * 0.2 +             // README 长度和完整度
  repo_age_factor * 0.2                    // 存在时间，有上限
)

// 势头 Momentum (0-100)
// 反映近期增长趋势
// V1: 不采集社媒数据，权重分配给 GitHub 指标
// V2: 加入社媒后调整为 stars_7d*0.5 + stars_30d*0.2 + mentions_7d*0.3
// 冷启动策略: 历史数据不足 7 天时，按可用天数等比折算
momentum = normalize(
  stars_gained_7d * 0.6 +
  stars_gained_30d * 0.25 +
  commits_gained_7d * 0.15
)

// 综合分 Overall (0-100)
overall = popularity * 0.30 +
          activity * 0.25 +
          maturity * 0.20 +
          momentum * 0.25
```

**normalize 函数**：基于全库百分位归一化到 0-100，避免绝对值差异过大。当 Skill 总数 < 50 时，使用固定区间归一化（预设合理上下限），避免小样本百分位剧烈波动。

**趋势判断**（基于 daily_snapshots 中保存的 overall_score 历史）：
- `rising`: 本周 overall 比上周高 5 分以上
- `declining`: 本周 overall 比上周低 5 分以上
- `stable`: 其他情况
- 冷启动期（< 7 天历史数据）：默认 `stable`

### 4.3 新 Skill 自动发现 — 每天 UTC 06:00（V1 必做）

**渠道一：GitHub Search（自动）**

```
1. GitHub Search API 搜索以下 topic/关键词：
   - topic: claude-code-skill, agent-skill, claude-skill, openclaw-skill, mcp-server
   - 关键词: "claude code skill" / "agent skill" / "MCP server" in:readme
2. 过滤掉已入库的仓库（按 GitHub repo_id 去重）
3. 调用 Workers AI 判断是否为真正的 Agent Skill（过滤误匹配）
4. 通过 AI 过滤的仓库自动入库，status = 'active'
5. 调用 Workers AI 生成完整 Wiki 内容（overview / use_cases / installation / tips 等）
6. 立即触发一次该 Skill 的数据采集和评分
```

**渠道二：Google Search 发现（自动，via Serper.dev）**

```
1. 通过 Serper.dev API 搜索以下关键词：
   - "claude code skill" site:github.com
   - "MCP server" site:github.com
   - "agent skill" claude site:github.com
   - "awesome claude code skills"（发现新的收集仓库）
2. 从搜索结果中提取 GitHub 仓库链接
3. 过滤掉已入库的仓库（按 GitHub repo_id 去重）
4. 调用 Workers AI 判断是否为真正的 Agent Skill
5. 入库并生成 Wiki 内容
6. 记录来源 → skill_sources 表（source_type = 'google_search'）
```

**渠道三：Awesome-list 仓库解析（自动）**

```
1. 维护一份已知的 Skill 收集仓库列表（如 awesome-claude-code-skills 等）
2. 也通过 Serper.dev 定期搜索新的收集仓库
3. 拉取这些仓库的 README/列表文件，解析其中的 GitHub 链接
4. 按渠道一相同流程入库和生成内容
5. 记录来源 → skill_sources 表（source_type = 'awesome_list'）
```

**渠道四：手动提交（管理 API）**

```
1. 通过 POST /api/admin/skills 提交从社媒等渠道发现的 Skill
2. Worker 自动拉取 GitHub 信息 + Serper 搜索补充 + AI 生成 Wiki 内容
3. 记录来源 → skill_sources 表（source_type = 'manual' 或 'social_media'）
```

### 4.4 社媒信号采集 — 每天 UTC 04:00（可选，V2 实现）

```
1. 对每个 Skill name + author 组合搜索：
   - Twitter/X Search API（需要 API key）
   - Reddit Search API（公开）
   - Hacker News Algolia API（公开）
2. 记录提及次数写入 daily_snapshots
```

> 注意：社媒采集可以 V2 再做，V1 先跑通 GitHub 数据即可。

---

## 五、API 设计（Workers Routes）

### 公开 API

```
GET /api/skills
  - 分页列表，支持筛选和排序
  - Query: category, sort (overall|popularity|activity|momentum), order (desc|asc), page, limit
  - 返回: skill 基础信息 + scores

GET /api/skills/:id
  - 单个 Skill 详情
  - 返回: 完整信息 + 评分 + 近 30 天趋势数据

GET /api/skills/:id/history
  - 历史数据
  - Query: days (默认 30)
  - 返回: 每日 snapshot 数组（用于画趋势图）

GET /api/trending
  - 本周势头最猛的 Skills
  - 返回: momentum 排名前 10

GET /api/categories
  - 返回所有分类及每个分类的 skill 数量

GET /api/stats
  - 全站统计: 总 Skill 数、总 Star 数、活跃 Skill 数等
```

### 管理 API（需要 API Key 鉴权）

```
POST /api/admin/skills
  - 手动提交 Skill（传入 GitHub URL + 来源信息）
  - Worker 自动拉取 GitHub 信息 + AI 生成 Wiki 内容
  - 用于录入从社媒、社区等渠道人工收集到的 Skill

POST /api/admin/skills/batch
  - 批量提交（传入 GitHub URL 数组）
  - 用于导入 awesome-list 解析结果

DELETE /api/admin/skills/:id
  - 下架一个 Skill

POST /api/admin/refresh
  - 手动触发一次全量数据采集和评分计算

POST /api/admin/regenerate/:id
  - 重新生成指定 Skill 的 AI Wiki 内容
```

> 注意：公开 API 主要服务于 Astro SSG 构建时拉数据，以及第三方接入。前端访问的是纯静态 HTML，不在运行时调用 API。管理 API 用于运营操作（手动录入、维护等）。

---

## 六、前端页面

### 技术方案

Astro SSG + 纯 HTML/CSS/JS（不引入 React/Vue），每日 Cron 跑完后触发 Cloudflare Pages 重新构建（通过 Deploy Hook），实现页面数据每日自动更新。

### 6.1 首页 `/`

**布局：**
- 导航栏：Logo + Browse Skills / Trending / Categories + 搜索框
- Hero 区：标题 + 副标题 + 全站统计数字（自动从 API 拉取）
- 分类筛选栏（All / Web / Document / Coding / Data / Design / DevOps）
- Skill 卡片网格（默认按 overall_score 排序）
- 每张卡片展示：
  - Skill 名称 + 作者
  - 一句话描述
  - 四维评分雷达图（小尺寸）或简化的综合评分
  - 标签（category + topics）
  - 兼容平台标记（CC / OC / ...）
  - 趋势标记（🔥 Rising / ⭐ Top / ✨ New）
- "How It Works" 说明区
- Footer

### 6.2 Skill 详情页（Wiki 页面）`/skill/:slug`

> 目标：为每个 Skill 生成一个资料详尽的 Wiki 页面，通过 Skill 名字在搜索引擎获取排名。

**SEO 策略：**
- Title: `{Skill Name} - Review, Installation & Usage Guide | SkillCard`
- H1: `{Skill Name} — AI Agent Skill Review`
- 页面内容覆盖搜索意图：是什么 / 怎么装 / 怎么用 / 有什么技巧 / 适合什么场景

**布局：**
- 头部：Skill 名称 + 作者头像和信息 + GitHub 链接 + Star 数 + 兼容平台标记
- AI 生成的综合评分 + 各维度拆解说明
- **Overview** — AI 生成的详细介绍（2-3 段）
- **Use Cases** — 适用场景列表（AI 提取，带图标）
- **Installation** — 安装方法（step-by-step，代码块一键复制）
- **Usage Guide** — 使用指南和常见用法示例
- **Tips & Best Practices** — 使用技巧
- **Pros & Cons** — AI 分析的优缺点
- Star 趋势折线图（近 30 天）
- 基本信息表：License / Language / 来源 / 创建时间 / 最后更新
- **Similar Skills** — 同用途/同分类的其他 Skill 推荐
- 结构化数据（JSON-LD: SoftwareSourceCode + AggregateRating）

### 6.3 Trending 页 `/trending`

- 本周 Rising Skills 排行
- 按 momentum_score 排序
- 展示 Star 增量、趋势箭头

### 6.4 分类页 `/category/:slug`

- 按分类展示 Skill 列表（Web / Document / Coding / Data / Design / DevOps）
- 独立 URL 承接长尾搜索词
- 支持排序（overall / popularity / activity / momentum）

### 6.5 用途/场景页 `/use-case/:tag`

> 承接"按用途搜索"的长尾流量，如 "best AI agent skill for web scraping"

- Title: `Best AI Agent Skills for {Use Case} | SkillCard`
- H1: `AI Agent Skills for {Use Case}`
- 按 use_case_tags 聚合 Skill，展示卡片列表
- 每个用途页包含：场景描述（AI 生成）+ 推荐 Skill 排行 + 对比表
- 常见用途标签示例：web-scraping, code-review, doc-writing, data-analysis, testing, deployment, design, file-management

---

## 七、自动化流水线（完整日常运转流程）

```
每天 UTC 02:00  ─── Cron Worker: 数据采集 + 搜索补充 + AI 处理 ──┐
                    (GitHub 数据 → Serper 搜索补充 →                │
                     AI 分类/Wiki 生成 → 入库)                      │
                                                                    │
每天 UTC 03:00  ─── Cron Worker: 评分计算 ─────────────────────────┤
                    (评分 → overall_score 写入快照)                  │
                                                                    │
每天 UTC 04:00  ─── Cron Worker: 社媒采集 ─────────────────────────┤ (V2)
                                                                    │
每天 UTC 06:00  ─── Cron Worker: 新 Skill 自动发现 ────────────────┤
                    (GitHub Search + Google Search + Awesome-list    │
                     → AI 过滤 → 入库 → Wiki 生成)                  │
                                                                    │
评分完成后       ─── Deploy Hook: Pages 重建 ────────────────────────┘
                    (自动拉取最新数据生成静态页)

结果: 用户每天访问 skillcard.me 看到的都是最新数据
      GitHub + Google + AI 全程自动驱动，零人工干预
```

---

## 八、项目结构

```
skillcard/
├── README.md
├── wrangler.toml                    # Cloudflare Workers 配置
├── package.json
│
├── worker/                          # Cloudflare Workers (API + Cron)
│   ├── src/
│   │   ├── index.ts                 # 入口: 路由分发 + Cron handler
│   │   ├── routes/
│   │   │   ├── skills.ts            # /api/skills CRUD
│   │   │   ├── trending.ts          # /api/trending
│   │   │   ├── categories.ts        # /api/categories
│   │   │   └── stats.ts             # /api/stats
│   │   ├── cron/
│   │   │   ├── collect-github.ts    # GitHub 数据采集
│   │   │   ├── collect-social.ts    # 社媒信号采集 (V2)
│   │   │   ├── calculate-scores.ts  # 评分计算
│   │   │   ├── discover-skills.ts   # 新 Skill 自动发现（GitHub Search）
│   │   │   ├── parse-awesome.ts     # Awesome-list 仓库解析
│   │   │   ├── generate-content.ts  # AI Wiki 内容生成
│   │   │   └── trigger-deploy.ts    # 触发 Pages 重建
│   │   ├── lib/
│   │   │   ├── github.ts            # GitHub API 封装
│   │   │   ├── search.ts           # Serper.dev Google Search 封装
│   │   │   ├── ai.ts               # Workers AI 封装（分类、Wiki 生成、过滤）
│   │   │   ├── scoring.ts           # 评分算法
│   │   │   ├── normalize.ts         # 归一化函数
│   │   │   └── cache.ts             # KV 缓存封装
│   │   └── db/
│   │       ├── schema.sql           # D1 建表语句
│   │       └── queries.ts           # SQL 查询封装
│   └── tsconfig.json
│
├── site/                            # Cloudflare Pages (前端)
│   ├── astro.config.mjs
│   ├── src/
│   │   ├── layouts/
│   │   │   └── Base.astro           # 基础布局
│   │   ├── pages/
│   │   │   ├── index.astro          # 首页
│   │   │   ├── skill/[slug].astro   # Skill Wiki 详情页
│   │   │   ├── trending.astro       # Trending 页
│   │   │   ├── category/
│   │   │   │   └── [slug].astro     # 分类页
│   │   │   └── use-case/
│   │   │       └── [tag].astro      # 用途/场景页
│   │   ├── components/
│   │   │   ├── SkillCard.astro      # Skill 卡片组件
│   │   │   ├── ScoreRadar.astro     # 四维评分雷达图
│   │   │   ├── TrendChart.astro     # Star 趋势图
│   │   │   ├── CategoryFilter.astro # 分类筛选
│   │   │   ├── SearchBar.astro      # 搜索框
│   │   │   └── StatsBar.astro       # 全站统计
│   │   └── styles/
│   │       └── global.css
│   └── public/
│       ├── favicon.svg
│       └── og-image.png             # SEO 社交分享图
│
├── scripts/                         # 本地工具脚本
│   ├── seed.ts                      # 初始化种子数据（手动跑一次）
│   ├── import-awesome.ts            # 解析 awesome-list 批量导入
│   └── test-scoring.ts              # 本地测试评分算法
│
└── docs/
    └── scoring-algorithm.md         # 评分算法详细说明
```

---

## 九、部署配置

### wrangler.toml 参考

```toml
name = "skillcard-worker"
main = "worker/src/index.ts"
compatibility_date = "2024-12-01"

[triggers]
crons = [
  "0 2 * * *",    # 每日数据采集 + AI 处理
  "0 3 * * *",    # 评分计算 → 完成后自动触发 Pages 重建
  "0 6 * * *"     # 新 Skill 自动发现
]

[[d1_databases]]
binding = "DB"
database_name = "skillcard"
database_id = "<创建后填入>"

[[kv_namespaces]]
binding = "CACHE"
id = "<创建后填入>"

[ai]
binding = "AI"

[vars]
SITE_URL = "https://skillcard.me"

# Secrets (通过 wrangler secret put 设置):
# GITHUB_TOKEN - GitHub Personal Access Token
# SERPER_API_KEY - Serper.dev Google Search API Key
# DEPLOY_HOOK_URL - Cloudflare Pages Deploy Hook URL
# ADMIN_API_KEY - 管理接口鉴权
```

---

## 十、V1 优先级（最小可用版本）

### V1 必须做（尽快上线）

1. ✅ D1 建表 + 种子数据（手动录入 + awesome-list 批量导入）
2. ✅ GitHub 数据采集 Cron Worker
3. ✅ Workers AI 集成 — 核心能力：
   - 自动分类、描述生成、兼容性判断
   - **Wiki 内容生成**（overview / use_cases / installation / tips / pros_cons）
   - use_case_tags 自动标注
4. ✅ 新 Skill 自动发现（GitHub Search + Awesome-list 解析 + AI 过滤）
5. ✅ 管理 API（手动提交社媒收集的 Skill、批量导入）
6. ✅ 评分计算逻辑（含冷启动降级策略）
7. ✅ 公开 API（/api/skills, /api/skills/:id, /api/trending, /api/categories）
8. ✅ 首页（Skill 卡片网格 + 分类筛选 + 排序）
9. ✅ **Skill Wiki 详情页**（AI 生成的完整资料页，SEO 友好）
10. ✅ 分类页 `/category/:slug`
11. ✅ 用途/场景页 `/use-case/:tag`（按用途聚合 Skill，承接长尾搜索）
12. ✅ 每日自动 Pages 重建（评分完成后触发）

### V2 增强（跑通后迭代）

- 社媒信号采集（Twitter/Reddit/HackerNews）
- 四维雷达图可视化
- 搜索功能（全文搜索 Skill 名称和描述）
- RSS 订阅（新 Skill 上架 / 周报）
- API 文档页
- 对比功能（选两个 Skill 并排对比）
- GitHub GraphQL API 优化（应对 Skill 数量增长到 1000+）

### V3 远期

- Agent 自动安装测试（需要外部 VPS）
- 用户评论系统（可选，保持轻量）
- Skill 作者认领和自定义信息
- 周报/月报自动生成并发布（AI 撰写）
- 人工提交入口（Submit 页）

---

## 十一、种子数据与初始采集策略

### 冷启动步骤

```
1. 手动录入已知 Skill（GitHub URL 列表）
2. 解析已知的 awesome-list 仓库，批量导入
3. 运行 GitHub Search 自动发现
4. 运行 Serper.dev Google Search 发现更多 Skill
5. 对所有入库 Skill：
   a. Serper 搜索补充信息（教程、讨论、评价）
   b. Workers AI 生成完整 Wiki 内容
6. 触发首次 Pages 构建上线
```

### 已知 Awesome-list 仓库（持续补充）

```
# Skill 收集仓库（解析其中的 GitHub 链接）
# - 在此补充已知的 awesome-list 仓库 URL...

# 直接录入的 Skills
# Web & Browser
- eze-is/web-access

# 在此补充更多已知的 Agent Skills...
```

### 采集渠道优先级

| 优先级 | 渠道 | 说明 |
|--------|------|------|
| P0 | Awesome-list 仓库解析 | 一次性批量导入大量 Skill |
| P0 | GitHub Search | 按 topic/关键词自动发现 |
| P0 | Google Search (Serper.dev) | 搜索发现 + 信息补充 |
| P1 | 手动录入（管理 API） | 社媒、社区等渠道人工收集 |
| P2 | 社媒自动采集 (V2) | Twitter/Reddit 自动搜索 |

---

## 十二、SEO 要点

### 页面 Title / H1 策略

| 页面 | Title | H1 |
|------|-------|-----|
| 首页 | `SkillCard - AI Agent Skill Reviews & Ratings` | `AI Agent Skill Discovery & Ratings` |
| Skill Wiki 页 | `{Skill Name} - Review, Installation & Usage Guide \| SkillCard` | `{Skill Name} — AI Agent Skill Review` |
| 分类页 | `Best {Category} AI Agent Skills \| SkillCard` | `{Category} AI Agent Skills` |
| 用途页 | `Best AI Agent Skills for {Use Case} \| SkillCard` | `AI Agent Skills for {Use Case}` |
| Trending 页 | `Trending AI Agent Skills This Week \| SkillCard` | `Trending AI Agent Skills` |

### 技术 SEO

- 生成 sitemap.xml（每日更新，包含所有 Skill Wiki 页、分类页、用途页）
- 结构化数据（JSON-LD）: `SoftwareSourceCode` + `AggregateRating` schema
- OG 标签：每个页面独立的 og:title / og:description / og:image
- 分类页面独立 URL: `/category/web`, `/category/coding` 等
- 用途页面独立 URL: `/use-case/web-scraping`, `/use-case/code-review` 等
- Skill Wiki 页内容丰富（安装方法、使用场景、技巧等），覆盖搜索意图
- 内链策略：Skill 页互相推荐 → 分类页聚合 → 用途页聚合，形成 SEO 内链网

---

## 十三、运维与保障

### 错误处理

- 单个 Skill 采集失败不中断整批，记录失败列表
- 失败的 Skill 在下次采集时优先重试
- 连续失败超过 3 天的 Skill 标记为 `status = 'pending'`
- AI 内容生成失败时保留旧内容，不覆盖

### API 限流

- 管理 API 通过 ADMIN_API_KEY 鉴权
- 公开 API 通过 Cloudflare Rate Limiting 保护（可选，按需开启）

### GitHub Token 配额管理

- 多个 Cron 任务共用同一个 Token（5000 次/小时）
- 每个 Skill 约 4 次 API 调用，100 个 Skill ≈ 400 次，配额充裕
- V2 考虑切换 GraphQL API（单次请求获取多字段）应对 1000+ Skill

### Serper.dev 用量

- 每次搜索消耗 1 credit
- 每个新 Skill 约需 2-3 次搜索（发现 + 信息补充）
- 每日自动发现约需 5-10 次搜索
- 合理控制：仅对新入库或需更新的 Skill 调用搜索

### Workers AI 用量

- Workers AI 免费额度: 每天 10,000 次推理（Llama 3.1 8B）
- 仅对新入库或 README 有更新的 Skill 调用 AI，控制用量
- Wiki 内容生成约需 3-5 次 AI 调用/Skill（分段生成）
- AI 输入 = GitHub README + Serper 搜索结果，产出更丰富准确的内容

### 数据备份

- Cloudflare D1 支持时间点恢复（需手动开启）
- 建议定期通过 API 导出关键数据

### 监控

- Cloudflare Workers Analytics（内置，免配置）
- Cron 任务执行完毕后记录统计信息到 KV（采集数 / 失败数 / 新发现数）
