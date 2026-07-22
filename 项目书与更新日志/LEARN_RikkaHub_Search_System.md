# RikkaHub 网络搜索系统 — 学习笔记 & 对比分析

> 学习来源：`C:\refs\rikkahub-master`（RikkaHub 开源项目，Kotlin 原生 Android）
> 学习目的：为我方香蕉牛奶机的网络搜索功能提供架构参考，解决「缺失 fetch/抓取能力」和「搜索结果渲染简陋」两个问题
> 对比基准：我方 `src/services/search/index.ts` + `src/apps/chat/components/ToolCard.tsx` + `use-send-message.ts` 中的 `executeToolCall` `search_web` 分支

---

## 一、整体架构对比

### 我方架构（当前）

```
┌─────────────────────────────────────────────────────┐
│                 3 个硬编码搜索供应商                   │
│  tavilySearch() → api.tavily.com/search              │
│  firecrawlSearch() → api.firecrawl.dev/v1/search     │
│  tinyfishSearch() → api.tinyfish.io/v1/search        │
│  仅支持 search，不支持 scrape/fetch                    │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  use-send-message.ts: executeToolCall()              │
│  search_web 分支:                                     │
│  ① 取第一个有 API Key 的供应商                         │
│  ② searchWeb(provider, config, query)                │
│  ③ return JSON.stringify(results) 给 LLM             │
│  ④ 无 scrape_web 工具定义                              │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  搜索结果显示: ToolCard.tsx                           │
│  通用工具卡片: 参数 JSON + 结果 JSON（纯代码块）        │
│  无搜索结果专属渲染、无链接跳转、无 favicon/标题/摘要   │
└─────────────────────────────────────────────────────┘
```

### RikkaHub 架构

```
┌──────────────────────────────────────────────────────────┐
│                 17 个搜索服务实现                           │
│  每个实现 SearchService<T> 接口:                           │
│  ├─ search(params) → SearchResult { answer, items, images}│
│  ├─ scrape(params) → ScrapedResult { urls[] }             │
│  ├─ parameters() → InputSchema（动态参数定义）              │
│  └─ scrapingParameters() → InputSchema?（null=不支持抓取） │
│  Tavily: search(/search) + scrape(/extract)               │
│  Firecrawl: search(/v1/search) + scrape(/v1/scrape)       │
│  Jina: search(s.jina.ai) + scrape(r.jina.ai)              │
│  ... 共 17 种                                             │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│  SearchTools.kt: createSearchTools()                       │
│  动态注册 1-2 个工具:                                      │
│  ├─ search_web（始终注册）→ 动态 description + 动态 params │
│  └─ scrape_web（仅当 service.scrapingParameters ≠ null）  │
│  工具 execute 中调用 service.search() / service.scrape()   │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│  UI 渲染（专用渲染器）:                                     │
│  SearchWebToolUI（ToolUIRegistry 注册）：                   │
│  ├─ Summary: favicon 行 + "找到 N 条结果"                  │
│  └─ Preview: 查询词 + answer 卡片 + 图片行 + 结果卡片列表   │
│     每张结果卡片: favicon + 标题 + 摘要 + URL（点击跳转）   │
│                                                           │
│  ScrapeWebToolUI（ToolUIRegistry 注册）：                   │
│  ├─ Summary: URL 显示                                      │
│  └─ Preview: URL 列表 + Markdown 内容渲染                  │
└──────────────────────────────────────────────────────────┘
```

---

## 二、关键差异分析

### 2.1 缺失 scrape/fetch 功能

**现状**：我方 `searchWeb()` 只执行搜索，无抓取实现。LLM 无法通过工具调用获取网页完整内容。

**RikkaHub**：每个搜索服务实现 `scrape(params)` 方法，利用各供应商的抓取 API：

| 供应商 | 搜索 API | 抓取 API |
|--------|---------|---------|
| Tavily | `/search` | `/extract`（传 urls 数组） |
| Firecrawl | `/v1/search` | `/v1/scrape`（传 url） |
| Jina | `s.jina.ai/{query}` | `r.jina.ai/{url}`（URL 重写式） |
| 自定义 | 脚本实现 | 脚本实现 |

**影响**：LLM 只能看到搜索摘要片段（通常 200-500 字符），无法阅读长文/整页内容来做总结或分析。

### 2.2 搜索结果数据模型过于简单

| 维度 | 我方 | RikkaHub |
|------|------|---------|
| 数据模型 | `SearchResult { title, url, content }` | `SearchResult { answer?, items[], images[] }` |
| answer | ❌ 无 | ✅ 含 AI 生成的回答摘要（Tavily 返回） |
| images | ❌ 无 | ✅ 相关图片 URL 列表 |
| items.id | ❌ 无 | ✅ 6 字符短 id，供 LLM 引用 `[citation,domain](id)` |
| content 长度 | 摘要片段 | 完整内容（含抓取） |

### 2.3 工具定义过于简单

| 维度 | 我方 | RikkaHub |
|------|------|---------|
| 工具数量 | 1 个 `search_web` | 2 个 `search_web` + `scrape_web` |
| 参数 | 仅 `query`（string） | 动态（取决于服务：`query` + `topic`/`sources`/`categories` 等） |
| description | 简单的纯文本 | 含日期、响应格式说明、引用格式示例、图片嵌入说明 |
| 服务选择 | 取第一个有 Key 的 | 在设置中选一个主要搜索服务，运行时动态路由 |

### 2.4 工具 description 质量差距

我方 `SEARCH_TOOL_DEFINITION.description`：
```
搜索网络获取实时信息。当用户问最新消息、天气、新闻等需要实时数据的问题时使用。
```

RikkaHub `search_web.description`（动态构建，含当日日期）：
```
Search the web for up-to-date or specific information.
Use this when the user asks for the latest news, current facts, or needs verification.
Today is July 18, 2026.

Response format:
- items[].id (short id), title, url, text
- images[]: image urls related to the query (may be empty)

Citations:
- After using results, add `[citation,domain](id)` after the sentence.
- Multiple citations are allowed.
- If no results are cited, omit citations.

Images:
- When images help the user understand the answer, embed relevant ones using Markdown: `![](url)`.
- Embed 2 to 4 images, and only use urls from `images[]` (never fabricate or alter urls).
```

**影响**：我方 LLM 不知道如何引用搜索结果、不知道返回格式包含什么字段、无法利用图片——这直接导致搜索结果的利用率低。

### 2.5 搜索结果 UI 渲染对比

| 维度 | 我方（ToolCard 通用卡片） | RikkaHub（专用渲染器） |
|------|------------------------|---------------------|
| 摘要行 | ❌ 只显示"已调用 N 个工具" | ✅ favicon 行 + "找到 N 条结果" |
| answer | ❌ 无 | ✅ 高亮卡片（Markdown） |
| 图片 | ❌ 无 | ✅ 图片横向滚动行 |
| 结果卡片 | ❌ 原始 JSON 代码块 | ✅ favicon + 标题 + 摘要 + URL |
| 链接跳转 | ❌ 无（纯文本代码块） | ✅ 点击卡片打开系统浏览器 |
| 抓取结果 | ❌ 无 | ✅ Markdown 渲染卡片 |
| 视觉层次 | ❌ 扁平 JSON | ✅ 结构化卡片列表 |

### 2.6 服务发现与热切换

**我方**：
- 3 个服务静态硬编码
- 运行时选「第一个有 API Key 的」
- 无法热切换服务

**RikkaHub**：
- 17 个服务通过 `SearchService.getService(options)` 动态路由
- 用户在设置中选择一个主搜索服务
- 每个服务的 `parameters()` 动态生成 tool 的参数 schema
- 搜索/抓取 URL 和认证方式各自封装
- 支持 Custom JS 脚本自定义搜索行为

---

## 三、差距总结清单

| # | 差距 | 严重程度 | 说明 |
|---|------|---------|------|
| 1 | **缺失 scrape/fetch 功能** | 🔴 高 | LLM 无法获取网页完整内容，搜索工具能力减半 |
| 2 | **搜索结果数据模型不完整** | 🟡 中 | 缺少 `answer`、`images`、`id`（引用用），限制了 LLM 的利用能力 |
| 3 | **工具 description 太简陋** | 🟡 中 | LLM 不知道返回格式、引用方式、图片嵌入规则 |
| 4 | **搜索结果 UI 渲染简陋** | 🟡 中 | 纯 JSON 代码块，无 favicon、标题、摘要、链接跳转 |
| 5 | **服务架构硬编码** | 🟢 低 | 3 个服务写死，不如 17 个+插件化灵活，但当前够用 |
| 6 | **无图片搜索结果** | 🟢 低 | 搜索图片可作为增值功能，非必需 |
| 7 | **无 answer 字段传递** | 🟢 低 | Tavily 的 `include_answer` 未启用，LLM 少了一个信息来源 |

---

## 四、改进方案

### 方案 A：最小修复 — 增加 scrape 能力和工具定义

**目标**：只修复最紧急的两个问题（缺失 fetch + 工具描述简陋），不改 UI。

**改动范围**：
1. `src/services/search/index.ts` — 为每个供应商增加 `scrapeWeb()` 函数（Tavily 用 `/extract`，Firecrawl 用 `/v1/scrape`，Tinyfish 用自有抓取 API）
2. `src/apps/settings/types.ts` — 搜索结果数据模型扩展（加 `answer`、`images`、`id`）
3. `src/hooks/use-send-message.ts` 的 `collectToolDefinitions` — 增加 `scrape_web` 工具定义，扩展 `search_web` 的 description（含引用格式和图片说明）
4. `src/hooks/use-send-message.ts` 的 `executeToolCall` — 增加 `scrape_web` 分支

**工作量**：约 150 行代码
**不涉及**：UI 渲染、搜索结果组件、服务架构重构

### 方案 B：中等改造 — 增加 scrape + 搜索结果专用 UI

**目标**：在方案 A 基础上，改善搜索结果的可视化呈现。

**额外改动范围**：
1. 新建 `src/apps/chat/components/SearchResultCard.tsx` — 搜索结果专用组件（favicon + 标题 + 摘要 + URL，点击跳转）
2. 改造 `src/apps/chat/components/ChainOfThought.tsx` — 搜索摘要行显示 `"找到 N 条结果"` + favicon 行
3. 改造 `src/apps/chat/components/ToolDrawer.tsx` — 搜索结果展示优化（区分搜索/抓取，展示结构化结果）

**工作量**：约 350 行代码（含方案 A 的 150 行）
**不涉及**：服务架构重构、17 个服务统一接口、热切换

### 方案 C：架构级重构 — 参考 RikkaHub 的搜索服务接口

**目标**：完整重构搜索层，采用插件式服务注册架构。

**改动范围**：
1. 定义 `SearchService` 接口（`search()` + `scrape()` + `parameters()` + `scrapingParameters()`）
2. 每个供应商实现该接口
3. 动态工具注册（`createSearchTools()` 模式）
4. 搜索结果专用 UI 组件
5. 设置页增加服务选择器

**工作量**：约 800+ 行代码
**优点**：可扩展性最强，后续新增搜索供应商无需改核心代码
**缺点**：改动大，当前 3 个供应商的场景有点过度设计

---

## 五、技术可行性说明

### Tavily 的 scrape/fetch 能力

Tavily 提供 `/extract` 端点（我方未使用）：
```typescript
POST https://api.tavily.com/extract
Body: { "urls": ["https://example.com"] }
Response: { "results": [{ "url": "...", "content": "...", "raw_content": "..." }] }
```

### Firecrawl 的 scrape/fetch 能力

Firecrawl 提供 `/v1/scrape` 端点（我方未使用）：
```typescript
POST https://api.firecrawl.dev/v1/scrape
Body: { "url": "https://example.com", "onlyMainContent": true }
Response: { "data": { "content": "...", "markdown": "...", "metadata": {...} } }
```

### Jina 的 URL 重写式搜索/抓取

Jina 搜索：`GET https://s.jina.ai/{query}`（带 Authorization header 返回搜索结果）
Jina 抓取：`GET https://r.jina.ai/{url}`（URL 重写，直接返回 Markdown 内容）
这种「URL 重写式」方案对我方最友好——无需额外 API，只需一个 HTTP GET。

这些 API 在我方 Capacitor WebView/浏览器环境中完全可以调用（普通 fetch），无需原生插件。
