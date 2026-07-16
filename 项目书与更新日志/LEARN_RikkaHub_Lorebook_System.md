# RikkaHub 世界书（Lorebook）系统 — 学习笔记 & 对接方案

> 学习来源：`C:\refs\rikkahub-master`
> 学习目的：为香蕉牛奶机世界书 APP 提供完整架构参考，覆盖数据模型、注入机制、UI 交互、与聊天 APP 的耦合关系

---

## 一、核心概念

RikkaHub 中世界书（Lorebook）的本质是**关键词触发的提示词注入系统**：

- **Lorebook（世界书）**：一个容器，包含名称、描述、多条条目
- **RegexInjection（条目）**：单条注入规则，含关键词、注入内容、注入位置、优先级等
- **ModeInjection（模式注入）**：与 Lorebook 同属 PromptInjection 体系，但基于开关触发而非关键词

世界书 = 一组关键词触发的注入规则的集合，类似"角色设定书"。

---

## 二、数据模型

### 2.1 Lorebook（世界书）

```kotlin
data class Lorebook(
    val id: Uuid,
    val name: String,           // 名称
    val description: String,    // 简介
    val enabled: Boolean,       // 启用/禁用
    val entries: List<RegexInjection>,  // 条目列表
)
```

### 2.2 RegexInjection（条目——单条规则）

```kotlin
data class RegexInjection(
    override val id: Uuid,
    override val name: String,         // 条目名称
    override val enabled: Boolean,     // 启用/禁用
    override val priority: Int,        // 优先级(1-100)，数值越高插入越靠前
    override val position: InjectionPosition, // 注入位置
    override val content: String,      // 注入到 LLM 的提示词内容
    override val injectDepth: Int,     // AT_DEPTH 时表示从最新消息往前数的深度
    override val role: MessageRole,    // 注入的角色(USER/ASSISTANT)
    val keywords: List<String>,       // 触发关键词
    val useRegex: Boolean,            // 是否使用正则匹配
    val caseSensitive: Boolean,       // 大小写敏感
    val scanDepth: Int,               // 扫描最近 N 条消息
    val constantActive: Boolean,      // 常驻激活(无需关键词匹配，始终注入)
)
```

### 2.3 InjectionPosition（5 种注入位置）

| 位置 | 枚举值 | 说明 | 典型场景 |
|------|--------|------|---------|
| 系统提示词前 | `BEFORE_SYSTEM_PROMPT` | 在 system message 最开头插入 | 全局前置指令 |
| 系统提示词后 | `AFTER_SYSTEM_PROMPT` | 在 system message 末尾追加 | 世界书内容注入（最常用） |
| 对话顶部 | `TOP_OF_CHAT` | 在第一条用户消息前插入一条新消息 | 行为引导、场景设定 |
| 对话底部 | `BOTTOM_OF_CHAT` | 在最后一条消息前插入 | 即时指令、当前场景提醒 |
| 指定深度 | `AT_DEPTH` | 从最新消息往前数 N 条的位置插入 | 精密位置控制 |

### 2.4 绑定关系

```
Agent（智能体）
  ├── lorebookIds: Set<Uuid>   ← 智能体级别绑定的世界书
  └── allowConversationPromptInjection: Boolean  ← 是否允许对话级别覆盖

Conversation（对话）
  └── lorebookIds: Set<Uuid>   ← 对话级别绑定的世界书（仅在 allowConversationPromptInjection=true 时生效）
```

**优先级规则**：
- `allowConversationPromptInjection=true` → 使用对话级 `lorebookIds`，忽略智能体级
- `allowConversationPromptInjection=false` → 使用智能体级 `lorebookIds`

---

## 三、注入机制详解

### 3.1 整体流程

```
用户发送消息
  ↓
Transformer 管道执行
  ↓
PromptInjectionTransformer.transform()
  ├── collectInjections()
  │   ├── 收集关联的 ModeInjection（开关触发）
  │   └── 收集关联的 Lorebook 中被触发的条目（关键词匹配）
  │       ├── 提取非 SYSTEM 消息作为上下文
  │       ├── 按 scanDepth 取最近 N 条
  │       ├── 对每条条目的关键词进行匹配
  │       └── 命中的添加到注入列表
  │
  ├── 按 position 分组，按 priority 排序
  │
  └── applyInjections()
      ├── BEFORE_SYSTEM_PROMPT → 追加到 system message 开头
      ├── AFTER_SYSTEM_PROMPT → 追加到 system message 末尾
      ├── TOP_OF_CHAT → 第一条用户消息前插入新消息
      ├── BOTTOM_OF_CHAT → 最后一条消息前插入
      └── AT_DEPTH → 从最新往前数 N 条位置插入
```

### 3.2 关键词匹配算法（isTriggered）

```kotlin
fun isTriggered(context: String): Boolean {
    if (!enabled) return false
    if (constantActive) return true        // 常驻激活，始终触发
    if (keywords.isEmpty()) return false   // 无关键词

    return keywords.any { keyword ->
        if (useRegex) {
            Regex(keyword, options).containsMatchIn(context)
        } else {
            context.contains(keyword, ignoreCase = !caseSensitive)
        }
    }
}
```

### 3.3 供应商兼容性

`findSafeInsertIndex()` 确保不会插入到 `USER → ASSISTANT(含 Tool)` 之间。
这是为了兼容 DeepSeek 等供应商——它们要求 USER 消息后必须紧跟着包含工具调用的 ASSISTANT 消息，
在两者之间插入消息会导致报错或破坏推理连续性。

---

## 四、UI 设计要点

### 4.1 世界书列表（PromptPage 的 LorebookTab）

- **Tab 布局**：与 ModeInjection 同属 PromptPage，分为两个 Tab
- **卡片列表**：每个世界书显示名称、描述、条目数、启用状态
- **拖拽排序**：长按拖动改变顺序（决定了遍历顺序，同优先级时先遍历的先注入）
- **左滑删除**：SwipeToDismissBox
- **浮动工具栏**：底部"添加世界书"按钮 + 导入按钮
- **导出功能**：每个世界书可单独导出 JSON

### 4.2 世界书编辑（LorebookEditSheet）

- Modal Bottom Sheet 形式，占 95% 高度
- 字段：名称、描述、启用开关
- **条目列表**：列出所有条目，可删除、编辑、新增
- 底部：取消 + 确认按钮

### 4.3 条目编辑（RegexInjectionEditDialog）

- AlertDialog 弹窗
- 字段：名称、启用开关、优先级、注入位置（下拉选择）、内容（多行文本）
- 关键词：InputChip 形式（标签式输入，可逐个添加/删除）
- 高级选项（可折叠/展开）：正则匹配开关、大小写敏感、扫描深度、注入角色、AT_DEPTH 深度值、常驻激活

### 4.4 智能体绑定

- 在 AssistantExtensionsPage 中，通过 ExtensionSelector 勾选世界书
- 每个世界书有 checkbox，勾选后相当于 `lorebookIds` 包含该 ID

### 4.5 对话级别绑定

- 在 FilePicker 区域显示已绑定的注入数（modeInjection + lorebook）
- 如果 `allowConversationPromptInjection=true`，对话可以选择自己的世界书

---

## 五、与聊天 APP 的耦合关系

### 5.1 需要对接的点

| 模块 | 对接内容 | 当前状态 |
|------|---------|---------|
| **Transformer Pipeline** | `promptInjectionTransformer` 填充触发逻辑 | ⚠️ 空占位 |
| **TransformerContext** | 需要传入世界书列表和绑定 ID | ⚠️ 已有字段但未使用 |
| **Agent（智能体）** | 添加 `lorebookIds` 字段（绑定关系） | ⬜ 未做 |
| **AgentSettings** | 世界书挂载选择界面 | ⚠️ Stub |
| **Conversation（对话）** | 添加 `lorebookIds` 字段（对话级绑定） | ⬜ 未做 |
| **ContextPreview** | 显示世界书注入后的完整上下文 | ⬜ 待更新 |

### 5.2 上下文拼装中的显示逻辑

在 `ContextPreviewPage` 中，世界书注入后应显示：

1. **系统提示词区域**：如果注入位置是 BEFORE_SYSTEM_PROMPT/AFTER_SYSTEM_PROMPT，文本已合并到 system message 中，需要标注哪些部分是来自世界书注入
2. **独立消息区域**：如果注入位置是 TOP_OF_CHAT/BOTTOM_OF_CHAT/AT_DEPTH，会插入独立的消息，应标注来源为"世界书注入：{世界书名称} → {条目名称}"
3. **命中缓存信息**：显示命中了几条世界书条目、消耗了多少 tokens

### 5.3 事件总线事件

- `lorebook:updated` — 世界书新增/编辑/删除时触发，通知智能体更新绑定列表
- `lorebook:binding-changed` — 智能体与某世界书的绑定关系变化

---

## 六、对接方案：需要做的事情

### 第一步：类型定义扩展

1. 扩展 `src/apps/chat/types.ts`：
   - 添加 `LorebookEntry` 类型（等同 RegexInjection）
   - 添加 `Lorebook` 类型（世界书容器）
   - Agent 接口添加 `lorebookIds: string[]`
   - 对话接口添加 `lorebookIds: string[]`

2. 扩展 `TransformerContext`：添加 `lorebooks: Lorebook[]`

### 第二步：Transformer 实现

3. 填充 `promptInjectionTransformer`：
   - 实现 `collectInjections()` — 匹配关键词
   - 实现 `applyInjections()` — 按位置注入
   - 实现 `findSafeInsertIndex()` — 供应商兼容

### 第三步：世界书 APP 开发

4. 创建 `src/apps/lorebook/` 目录
5. 实现世界书 CRUD（书架布局，一书 2 列）
6. 实现条目管理（关键词输入、注入位置选择）
7. 实现导入/导出 JSON
8. 实现书封图片上传裁剪

### 第四步：绑定机制

9. AgentSettings 中世界书挂载选择（勾选列表）
10. TransformerContext 构建时传入绑定信息

### 第五步：ContextPreview 适配

11. ContextPreviewPage 显示世界书注入区块

---

## 七、关键设计决策（对接我们项目的调整）

### 7.1 简化设计

RikkaHub 的 PromptInjection 体系包含 ModeInjection 和 RegexInjection 两种，
我们项目书中只要求了世界书（关键词触发），不包含 ModeInjection（开关触发模式）。
因此：

- **只实现 RegexInjection**（即世界书条目），不实现 ModeInjection
- **与项目书中"常驻激活"和"关键词激活"对应**：constantActive = 常驻激活，keywords = 关键词激活

### 7.2 注入位置对应项目书要求

项目书说：插入位置有"系统提示词前、系统提示词后、用户最新输入消息前"

这对应我们 5 位置中的：
- 系统提示词前 = BEFORE_SYSTEM_PROMPT
- 系统提示词后 = AFTER_SYSTEM_PROMPT  
- 用户最新输入消息前 = BOTTOM_OF_CHAT

我们同时保留 TOP_OF_CHAT 和 AT_DEPTH 作为高级选项。

### 7.3 存储方案

- 世界书数据存入 IndexedDB，独立 Store（不混入 chat-store）
- 每条世界书用 UUID 作为 ID
- 绑定关系：在 Agent 数据中存 `lorebookIds: string[]`

### 7.4 补充知识点：缓存命中

RikkaHub 的 Lorebook 本身不做缓存（每个请求重新匹配关键词），但匹配结果在 LLM 请求中表现为"系统提示词末尾追加文本"，
这部分是静态内容的一部分，可以受益于 Claude Prompt Caching。

我们的项目中，世界书内容注入到 system message 后，同样能受益于已有的缓存机制（如 Claude API 的 cache_control）。

---

## 八、所需文件清单

| 文件 | 说明 |
|------|------|
| `src/apps/lorebook/types.ts` | 世界书数据模型 |
| `src/apps/lorebook/store/lorebook-store.ts` | Zustand store |
| `src/apps/lorebook/pages/LorebookListPage.tsx` | 书架列表页 |
| `src/apps/lorebook/pages/LorebookDetailPage.tsx` | 世界书详情（条目管理） |
| `src/apps/lorebook/components/LorebookCard.tsx` | 书籍卡片 |
| `src/apps/lorebook/components/EntryEditor.tsx` | 条目编辑弹窗 |
| `src/apps/chat/components/LorebookSelector.tsx` | 智能体绑定选择器 |
| `src/services/transformer-pipeline/prompt-injection.ts` | ⚠️ 填充注入逻辑 |
| `src/apps/chat/pages/ContextPreviewPage.tsx` | ⚠️ 适配世界书注入显示 |

---

*学习时间：2026-07-16，基于 RikkaHub master 分支*
