# SkillCard.me — AI Agent Skill 自动评测平台

> 域名：skillcard.me
> 全自动运转，零人工干预，数据驱动排名

---

## 一、项目定位

SkillCard 是一个 **全自动化** 的 AI Agent Skill 评测与发现平台。

核心理念：**不依赖用户手动打分**，通过自动采集 GitHub 数据、社媒传播信号、兼容性测试等客观指标，生成每个 Skill 的评分和排名。网站内容由定时任务驱动更新，全程无需人工干预。

**Title**: SkillCard - AI Agent Skill Reviews & Ratings
**H1**: AI Agent Skill Reviews by Real Users

---

## 二、技术架构

### 全栈 Cloudflare，不依赖传统服务器

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare 全家桶                      │
│                                                         │
│  ┌──────────────────┐    ┌───────────────────────────┐  │
│  │  Cloudflare Pages │    │  Cloudflare Workers       │  │
│  │  (前端静态站)      │◄───│  (API + 定时任务)          │  │
│  │  skillcard.me     │    │                           │  │
│  └──────────────────┘    │  ┌─────────────────────┐  │  │
│                          │  │ Cron Trigger (每日)  │  │  │
│                          │  │ - GitHub 数据采集     │  │  │
│                          │  │ - 社媒信号采集        │  │  │
│                          │  │ - 评分计算           │  │  │
│                          │  │ - 新 Skill 自动发现   │  │  │
│                          │  └─────────────────────┘  │  │
│                          └───────────┬───────────────┘  │
│                                      │                  │
│                          ┌───────────▼───────────────┐  │
│                          │  D1 (SQLite 数据库)        │  │
│                          │  - skills 表              │  │
│                          │  - daily_snapshots 表     │  │
│                          │  - scores 表              │  │
│                          └───────────────────────────┘  │
│                                                         │
│                          ┌───────────────────────────┐  │
│                          │  KV (缓存层)               │  │
│                          │  - 首页数据缓存            │  │
│                          │  - API 响应缓存            │  │
│                          └───────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 技术选型

| 层级 | 选型 | 说明 |
|------|------|------|
| 前端 | Cloudflare Pages + Astro (SSG) | 每日构建一次，纯静态，极速加载 |
| API | Cloudflare Workers | 提供 REST API，同时负责定时任务 |
| 数据库 | Cloudflare D1 (SQLite) | 结构化数据存储，免费 5GB |
| 缓存 | Cloudflare KV | 热数据缓存，减少 D1 查询 |
| 定时任务 | Workers Cron Triggers | 每天自动执行数据采集和评分计算 |
| 部署 | Wrangler CLI | 一键部署 Workers + Pages |

---

## 三、数据模型

### 3.1 skills 表（Skill 基础信息）

```sql
CREATE TABLE skills (
  id TEXT PRIMARY KEY,                    -- 唯一标识，格式: owner/repo
  github_url TEXT NOT NULL,               -- GitHub 仓库地址
  name TEXT NOT NULL,                     -- Skill 名称
  description TEXT,                       -- 简介
  author TEXT NOT NULL,                   -- 作者（GitHub username）
  avatar_url TEXT,                        -- 作者头像
  homepage_url TEXT,                      -- 项目主页（如有）
  license TEXT,                           -- 开源协议
  language TEXT,                          -- 主要编程语言
  topics TEXT,                            -- GitHub topics, JSON 数组
  readme_excerpt TEXT,                    -- README 前 500 字摘要
  compatibility TEXT DEFAULT '[]',        -- 兼容平台, JSON 数组 ["claude-code","openclaw"]
  category TEXT DEFAULT 'other',          -- 分类: web, document, coding, data, design, devops, other
  status TEXT DEFAULT 'active',           -- active / archived / pending
  first_seen_at TEXT NOT NULL,            -- 首次入库时间
  created_at TEXT NOT NULL,               -- GitHub 仓库创建时间
  updated_at TEXT NOT NULL                -- 最后更新时间
);
```

### 3.2 daily_snapshots 表（每日数据快照）

```sql
CREATE TABLE daily_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id TEXT NOT NULL,
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
  -- 社媒信号
  mentions_twitter INTEGER DEFAULT 0,     -- Twitter/X 提及数
  mentions_reddit INTEGER DEFAULT 0,      -- Reddit 提及数
  mentions_wechat INTEGER DEFAULT 0,      -- 微信公众号提及数（预留）
  -- 原始 JSON 备份
  raw_github_data TEXT,                   -- GitHub API 原始返回, JSON
  UNIQUE(skill_id, date),
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);
```

### 3.3 scores 表（计算后的评分）

```sql
CREATE TABLE scores (
  skill_id TEXT PRIMARY KEY,
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
3. 写入 daily_snapshots 表
4. 触发评分计算
5. 刷新 KV 缓存
```

**GitHub API 注意事项：**
- 需要一个 GitHub Personal Access Token（存在 Workers Secrets 中）
- 免费额度: 5000 次/小时，足够覆盖数百个 Skill
- 使用条件请求（If-None-Match）节省配额

### 4.2 评分计算 — 紧跟数据采集后执行

**评分公式：**

```javascript
// 热度 Popularity (0-100)
// 反映当前受关注程度
popularity = normalize(
  stars * 0.4 +
  forks * 0.2 +
  mentions_total * 0.3 +
  watchers * 0.1
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
momentum = normalize(
  stars_gained_7d * 0.5 +
  stars_gained_30d * 0.2 +
  mentions_gained_7d * 0.3
)

// 综合分 Overall (0-100)
overall = popularity * 0.30 +
          activity * 0.25 +
          maturity * 0.20 +
          momentum * 0.25
```

**normalize 函数**：基于全库百分位归一化到 0-100，避免绝对值差异过大。

**趋势判断**：
- `rising`: 本周 overall 比上周高 5 分以上
- `declining`: 本周 overall 比上周低 5 分以上
- `stable`: 其他情况

### 4.3 新 Skill 自动发现 — 每天 UTC 06:00

```
1. GitHub Search API 搜索以下 topic/关键词：
   - topic: claude-code-skill, agent-skill, claude-skill, openclaw-skill
   - 关键词: "claude code skill" / "agent skill" in:readme
2. 过滤掉已入库的仓库
3. 新发现的仓库自动入库，status = 'active'
4. 自动解析 README 提取 description、compatibility 信息
5. 自动分类（基于 topics 和 README 关键词匹配）
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
POST /api/skills
  - 手动提交一个 Skill（传入 GitHub URL）
  - Worker 自动拉取 GitHub 信息填充

DELETE /api/skills/:id
  - 下架一个 Skill

POST /api/refresh
  - 手动触发一次全量数据采集和评分计算
```

---

## 六、前端页面

### 技术方案

Astro SSG + 纯 HTML/CSS/JS（不引入 React/Vue），每日 Cron 跑完后触发 Cloudflare Pages 重新构建（通过 Deploy Hook），实现页面数据每日自动更新。

### 6.1 首页 `/`

**布局：**
- 导航栏：Logo + Browse Skills / Trending / Submit + 搜索框
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

### 6.2 Skill 详情页 `/skill/:id`

**布局：**
- 头部：Skill 名称 + 作者信息 + GitHub 链接 + Star 数
- 四维评分雷达图（大尺寸）
- 综合评分 + 各维度拆解说明
- Star 趋势折线图（近 30 天）
- 基本信息表：License / Language / 兼容性 / 创建时间 / 最后更新
- README 摘要
- 安装命令（一键复制）
- 相关 Skills 推荐（同分类 + 高分）

### 6.3 Trending 页 `/trending`

- 本周 Rising Skills 排行
- 按 momentum_score 排序
- 展示 Star 增量、趋势箭头

### 6.4 Submit 页 `/submit`

- 一个输入框：粘贴 GitHub 仓库 URL
- 提交后 Worker 自动拉取信息、入库
- 展示处理状态

---

## 七、自动化流水线（完整日常运转流程）

```
每天 UTC 02:00  ─── Cron Worker: 数据采集 ───┐
                                              │
每天 UTC 02:30  ─── Cron Worker: 评分计算 ───┤
                                              │
每天 UTC 04:00  ─── Cron Worker: 社媒采集 ───┤ (V2)
                                              │
每天 UTC 06:00  ─── Cron Worker: 新 Skill 发现 ─┤
                                              │
每天 UTC 07:00  ─── Deploy Hook: Pages 重建 ──┘
                    (自动拉取最新数据生成静态页)

结果: 用户每天访问 skillcard.me 看到的都是最新数据
      零人工干预
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
│   │   │   ├── stats.ts             # /api/stats
│   │   │   └── submit.ts            # /api/skills POST
│   │   ├── cron/
│   │   │   ├── collect-github.ts    # GitHub 数据采集
│   │   │   ├── collect-social.ts    # 社媒信号采集 (V2)
│   │   │   ├── calculate-scores.ts  # 评分计算
│   │   │   ├── discover-skills.ts   # 新 Skill 自动发现
│   │   │   └── trigger-deploy.ts    # 触发 Pages 重建
│   │   ├── lib/
│   │   │   ├── github.ts            # GitHub API 封装
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
│   │   │   ├── skill/[id].astro     # Skill 详情页
│   │   │   ├── trending.astro       # Trending 页
│   │   │   └── submit.astro         # 提交页
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
  "0 2 * * *",    # 每日数据采集
  "30 2 * * *",   # 评分计算
  "0 6 * * *",    # 新 Skill 发现
  "0 7 * * *"     # 触发 Pages 重建
]

[[d1_databases]]
binding = "DB"
database_name = "skillcard"
database_id = "<创建后填入>"

[[kv_namespaces]]
binding = "CACHE"
id = "<创建后填入>"

[vars]
SITE_URL = "https://skillcard.me"

# Secrets (通过 wrangler secret put 设置):
# GITHUB_TOKEN - GitHub Personal Access Token
# DEPLOY_HOOK_URL - Cloudflare Pages Deploy Hook URL
# ADMIN_API_KEY - 管理接口鉴权
```

---

## 十、V1 优先级（最小可用版本）

### V1 必须做（先跑起来）

1. ✅ D1 建表 + 种子数据（手动录入 20-30 个已知 Skill）
2. ✅ GitHub 数据采集 Cron Worker
3. ✅ 评分计算逻辑
4. ✅ 公开 API（/api/skills, /api/skills/:id, /api/trending）
5. ✅ 首页（Skill 卡片网格 + 分类筛选 + 排序）
6. ✅ Skill 详情页（评分 + 趋势图 + README）
7. ✅ Submit 页（提交 GitHub URL 自动入库）
8. ✅ 每日自动 Pages 重建

### V2 增强（跑通后迭代）

- 社媒信号采集（Twitter/Reddit/HackerNews）
- 新 Skill 自动发现（GitHub Search）
- 四维雷达图可视化
- 搜索功能（全文搜索 Skill 名称和描述）
- RSS 订阅（新 Skill 上架 / 周报）
- API 文档页
- 对比功能（选两个 Skill 并排对比）

### V3 远期

- Agent 自动安装测试（需要外部 VPS）
- 用户评论系统（可选，保持轻量）
- Skill 作者认领和自定义信息
- 周报/月报自动生成并发布

---

## 十一、种子数据（V1 初始收录列表）

首批手动录入的 Skills，用于冷启动：

```
# Web & Browser
- eze-is/web-access

# 在此补充更多已知的 Agent Skills...
# 可以从以下渠道收集:
# - GitHub topic: claude-code-skill
# - GitHub topic: agent-skill  
# - Claude Code 官方文档提及的 Skills
# - OpenClaw 生态的 Skills
# - 社区分享的 Skills（Twitter/X、微信公众号等）
```

> 建议在开始开发前，先花 30 分钟收集 20-30 个已知 Skill 的 GitHub URL，作为种子数据。

---

## 十二、SEO 要点

- 每个 Skill 详情页的 Title: `{Skill Name} Review & Rating - SkillCard`
- 每个 Skill 详情页的 H1: `{Skill Name} - AI Agent Skill Review`
- 首页 Title: `SkillCard - AI Agent Skill Reviews & Ratings`
- 首页 H1: `AI Agent Skill Reviews by Real Users`
- 生成 sitemap.xml（每日更新）
- 结构化数据（JSON-LD）: SoftwareApplication + AggregateRating schema
- OG 标签：每个页面独立的 og:title / og:description / og:image
- 分类页面可做独立 URL: `/category/web`, `/category/coding` 等，承接长尾词
