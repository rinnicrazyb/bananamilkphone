# LumiMuse 记忆系统 — 学习笔记

> 学习来源：`C:\refs\LumiMuse-master`（Next.js + TypeScript 开源项目）
> 学习目的：为香蕉牛奶机聊天 APP 的"长期记忆"功能提供架构参考

---

## 一、项目概况

| 维度 | 说明 |
|------|------|
| 框架 | Next.js（React 19 + TypeScript 5） |
| 数据库 | SQLite（better-sqlite3） |
| 特点 | 记忆系统极其完善，覆盖提取/存储/检索/归档/画像全生命周期 |

---

## 二、记忆数据模型

### 2.1 核心接口

```typescript
interface Memory {
  id: string;
  character_id: string;
  category: MemoryCategory;    // 7 大分类
  content: string;             // 记忆正文（完整句子）
  confidence: number;          // 置信度 0-1
  tags: string[];              // 标签（最多3个）
  source_msg_ids: string[];    // 来源消息 ID
  memory_kind: MemoryKind;     // 7 种记忆类型
  importance: number;          // 重要性 0-1
  emotional_weight: number;    // 情绪权重 0-1
  status: MemoryStatus;        // active/archived/superseded 等
  pinned: boolean;             // 是否置顶
  last_used_at: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
}
```

### 2.2 7 大分类（MemoryCategory）

```
关系动态、话题历史、基础信息、偏好习惯、人格特质、重要事件、四季日常
```

每种分类有默认的 `memory_kind`、`importance`、`emotional_weight`：

| 分类 | 默认 kind | 默认 importance | 说明 |
|------|----------|----------------|------|
| 基础信息 | user_fact | 0.85 | 身高/体重/学业/家庭 |
| 人格特质 | user_fact | 0.80 | 性格/价值观/自我认知 |
| 重要事件 | relationship_event | 0.75 | 考试/答辩/旅行/生病 |
| 偏好习惯 | user_preference | 0.65 | 饮食/作息/娱乐偏好 |
| 关系动态 | relationship_event | 0.60 | 称呼/亲密/情话/争吵 |
| 四季日常 | general | 0.40 | 日常琐碎 |
| 话题历史 | general | 0.45 | 讨论过的电影/书籍等 |

### 2.3 7 种记忆类型（MemoryKind）

```
general          — 普通话题历史
user_fact        — 用户基础信息/人格/长期背景
user_preference  — 用户偏好/习惯/边界
relationship_event — 关系变化/共同经历/重要互动
character_promise  — 角色的承诺/约定（特别注意：不同于 user_fact）
open_thread        — 未完成事项，需后续跟进
world_state        — 角色世界观或长期状态变化
```

---

## 三、记忆提取流程（核心）

### 3.1 手动提取（Manual Selection → LLM Summarization）

这是用户最直接的操作路径，也是我们对接到本项目最重要的部分：

```
用户选择消息条目 → 系统格式化 → 调用 LLM → 解析 JSON → 合并/存储
```

#### 步骤详解

**Step 1：用户选择消息**
在对话界面中，用户勾选需要提取记忆的消息条目

**Step 2：格式化消息**
```typescript
function formatExtractionMessage(message, characterName) {
  const speaker = message.role === 'user' ? '用户' : characterName;
  const d = new Date(message.created_at);
  const ts = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;
  return `${speaker} (${ts}): ${message.content}`;
}
```

**Step 3：发送给 LLM**
使用 `EXTRACTION_PROMPT`（约 3000 tokens 的详细 prompt），包含：
- 已提取的记忆列表（供参考，避免重复）
- 时间处理规则（相对时间泛化，重要事件保留日期）
- 代词替换规则（"AI"→"我"，保持第一人称视角）
- 合并与拆分规则
- 7 大分类说明
- 标签规范表
- memory_kind 规则
- 重要性与情绪权重评分规则
- **输出格式要求**（严格的 JSON schema）

**Step 4：LLM 返回 JSON**
```json
{
  "memories": [
    {
      "category": "话题历史",
      "memory_kind": "general",
      "content": "2026年3月30日，用户和我一起看了《海上钢琴师》...",
      "tags": ["电影", "观后感"],
      "importance": 0.55,
      "emotional_weight": 0.2,
      "lifecycle_action": "upsert"
    }
  ]
}
```

**Step 5：lifecycle_action 决策**

| action | 含义 |
|--------|------|
| insert | 全新记忆，直接插入 |
| upsert | 更新/合并到已有记忆 |
| supersede | 替换旧记忆 |
| ignore | 忽略（LLM 自己判断无价值） |

**Step 6：合并逻辑**
```typescript
mergeMemories(existing, newMemories)
```
- 按 category 分组比对
- content text similarity（bigram Jaccard）
- anchor overlap（《书名》、「称呼」、"关键术语"）
- tag overlap
- 相似度 > 0.72 则合并（保留内容更长、更完整的一方）
- 合并时 tags 取并集（最多 5 个）

### 3.2 自动提取触发

LumiMuse 有后台队列自动提取，触发条件：

| 触发方式 | 说明 |
|---------|------|
| **消息数达到阈值** | 每个对话新产生 N 条消息后自动入队提取任务 |
| **后台定时任务** | 定期检查待处理队列 |
| **手动立即提取** | 用户在对话页面点击"立即提取" |
| **对话切换** | 切换到其他对话时触发一次 |

### 3.3 提取队列（memory-queue.ts）

```typescript
- 任务写入 memory_tasks 表（持久化，服务重启不丢失）
- 同一对话同一时间只有一个 pending/processing 任务
- 处理完后自动删除任务，同对话的新消息会创建新任务
- 去重保护：inFlightConversations 内存集合 + DB 事务双重保障
```

---

## 四、记忆检索系统

### 4.1 三种检索模式

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| local | 纯本地关键词（bigram 分词 + TF-IDF 风格评分） | 无 embedding API |
| hybrid | 本地 + 向量 embedding 混合 | 有 embedding API |
| vector | 纯向量检索 | embedding 质量高 |

### 4.2 本地评分算法

```typescript
function retrieveRelevantMemories(queryText, characterId, maxMemories = 30) {
  // 1. 获取所有 active 记忆（按 pinned/importance 排序，最多 500 条）
  // 2. 如果 <= maxMemories，直接返回（不需要评分）
  // 3. 否则执行 tokenize + scoring
  
  // tokenize：CJK bigram + 英文单词 + 书名号内容
  // 去停用词（中午/午餐等 140+ 个高频虚词）
  
  // 评分：intersection / sqrt(|memoryTokens| * |queryTokens|)
  // TF-IDF 风格的余弦近似，短而精确的记忆不会被长记忆挤出 top-N
  
  // 高性能缓存：memoryTokenCache（FIFO，1000 条上限）
  // 内容变化通过 djb2 hash 自动失效
}
```

### 4.3 优先级注入

以下记忆总是先于评分注入（不占评分名额）：
- pinned（用户置顶）
- importance >= 0.85
- memory_kind = character_promise

### 4.4 记忆上下文的注入格式

```typescript
const MEMORY_CONTEXT_TITLE = '## 记忆上下文';

const MEMORY_USAGE_PRINCIPLES = `### 记忆使用原则
记忆上下文是系统整理过的长期记忆。请自然使用...
如果旧记忆和当前消息冲突，以当前消息为准。`;
```

记忆被格式化为一个区块注入到 system prompt 或对话中，包含：
1. 标题 `## 记忆上下文`
2. 使用原则
3. 记忆条目列表（按重要性排序，含 content + tags）

---

## 五、标签系统

### 5.1 标签规范表（TAG_SPEC）

8 组标准标签，供 LLM 提取时参考：

```
关系：称呼、承诺、约定、情话、告白、亲密、吵架、和好、纪念日、陪伴方式
情感：依赖、思念、安全感、吃醋、感动
偏好：饮食、口味、作息、娱乐、音乐、电影、书籍、游戏、运动、穿搭
日常：早餐、午餐、晚餐、夜宵、睡眠、天气、通勤、家务、散步、购物
基础信息：年龄、身高、体重、职业、学业、专业、家乡、住址、家庭、健康、星座、MBTI
人格：性格、价值观、焦虑、自我认知、习惯
事件：考试、面试、答辩、旅行、生病、成就、决定、搬家、生日、节日
话题：对话、观点、计划、推荐、回忆
```

### 5.2 标签别名归一

```typescript
const TAG_ALIASES = {
  午饭: '午餐', 中饭: '午餐', 晚饭: '晚餐',
  聊天: '对话', 谈话: '对话',
  影片: '电影', 观影: '电影',
  学习: '学业', 上学: '学业',
  健身: '运动', 锻炼: '运动',
  // ... 更多别名
};
```

**核心设计思想**：标签一致性靠**别名表固定归一来保证**，不依赖 LLM 自觉。无论 LLM 给出哪种近义写法，服务端落地时都会收敛到同一规范词。

---

## 六、记忆档案（Memory Profile）

每个角色有一个"记忆画像"（character-level summary），由 LLM 定期生成：

```typescript
interface CharacterMemoryProfile {
  profile_name: string;           // 用户对 AI 的常用称呼/关系定位
  relationship_state: string;     // 当前关系状态
  recent_story_state: string;     // 最近故事进展
  emotional_baseline: string;     // 情绪基线
  open_threads: string[];         // 未完成事项
  user_profile_summary: string;   // 用户画像总结
  pinned_summary: string;         // 置顶记忆总结
}
```

画像在以下情况触发更新：
- 新记忆提取后
- 手动请求更新
- 定时维护任务

---

## 七、记忆归档（Memory Archive）

当活跃记忆过多时，AI 会审查旧记忆并生成归档摘要：

```typescript
const AI_ARCHIVE_PROMPT = `...选择适合归档的旧记忆...生成一条精炼的归档摘要...`;
```

归档标准：
- 应归档：低 importance 的日常闲聊、重复表达的偏好、已过时的状态
- 应保留：高 importance 的承诺/约定、角色承诺、pinned 记忆、近期重要事件
- 保守原则：不确定时就不归档

---

## 八、提取 Prompt 的关键设计（对我们的项目最有价值）

### 8.1 Prompt 结构

```typescript
EXTRACTION_PROMPT = `逐行扫描以下对话，提取用户的所有记忆信息。

## 已提取的记忆（供参考，避免重复）
{existing_memories}

## 时间处理规则（重要！）
- 带有时间戳的消息：直接引用绝对时间
- 相对时间词（昨晚/今天/刚才）：必须泛化
- 日常记忆（普通闲聊/偏好/人格）：用"某次""之前"泛化
- 重要事件/关系动态：日期前置

## 代词替换规则（重要！）
- "AI"、"你"、"助手"、"角色" → 统一替换为"我"
- 保持第一人称视角

## 合并与拆分规则
- 同对象/话题 → 合并为一条
- 不同对象/话题 → 拆成不同条目

## 七大分类说明
...（每个分类的详细规则）

## 标签规范表
${TAG_SPEC}

## memory_kind 规则
...

## 输出格式
{"memories": [...]}
`
```

### 8.2 Prompt 设计要点

1. **示例驱动**：prompt 内有完整的 JSON 输出示例
2. **防污染规则**：特殊规则处理角色承诺不写成用户事实
3. **content 要求**：写成适合长期记忆的完整句子，禁止分析腔
4. **去重保护**：传入 `{existing_memories}` 供 LLM 参考
5. **明确的 schema**：每个字段的类型和可选值都列出

---

## 九、对接香蕉牛奶机的方案

### 9.1 当前记忆功能现状

我们已有：
- `Memory` 数据类型 + `chat-store` 中的 CRUD
- `MemoryPage.tsx` 全屏列表页面（新增/编辑/删除）
- `SystemPromptTransformer` 将记忆注入到 system message

缺少的：
- ❌ 手动选择消息 → LLM 总结 → 保存的流程
- ❌ 标签系统
- ❌ 分类/重要性/情绪权重体系
- ❌ 提取 prompt
- ❌ 自动提取触发

### 9.2 建议对接步骤

**Phase A：扩展数据模型**
- 为 `Memory` 添加 `category`、`tags`、`importance`、`confidence`、`sourceMsgIds` 字段
- 可选：添加 `memoryKind`（但可能对伴侣式 AI 不需要 character_promise 等）

**Phase B：实现手动提取流程**
- 在 MemoryPage 添加"从对话提取"按钮/区域
- 用户选择消息 → 调用 LLM → 解析响应 → 保存

**Phase C：提取 Prompt 定制**
- 根据"伴侣 AI"的特点定制 EXTRACTION_PROMPT（去掉重要的第三方分析腔，加入伴侣视角）
- 标注替换规则：因为这是 AI 伴侣，要特别注意保持爱意和亲密感

**Phase D：标签系统（简化版）**
- 定义少量伴侣场景标签（比如：称呼、情话、纪念日、约定、喜好、日常）  
- 别名归一表

**Phase E：自动提取（可选延后）**
- 消息数达到阈值后自动提取
- 后台队列
