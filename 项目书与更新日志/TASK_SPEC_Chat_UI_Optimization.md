# TASK_SPEC_Chat_UI_Optimization.md

> **聊天界面全面优化 — 开发规格**
> 基于 grill-me 访谈生成（2026-07-21）
> 参与方：用户 + agent
> 参考项目：RikkaHub (`C:\refs\rikkahub-master`) · TauriTavern (`C:\refs\TauriTavern-docs-refresh`)

---

## 一、访谈决策汇总

### 1.1 已确认的决策（不可逆）

| # | 决策项 | 结论 | 来源 |
|---|--------|------|------|
| D1 | 滚动方案 | **窗口化聊天**：SQLite 分页查询 → ChatView 只渲染窗口内 ~100 条消息 → 滚顶加载更早 → 回收尾部 DOM。上下文拼装从 SQLite 全量读（不受窗口限制） | 用户选择：现在就做 |
| D2 | 数据存储 | SQLite 保持为唯一数据源。Zustand store 降级为 ChatView 视图缓存。备份/WebDAV 导出整份 .db 文件，不需要改 | 访谈确认 |
| D3 | HTML 渲染时机 | **流式过程显示代码**（hljs 语法高亮）→ **输出完毕**自动切换为 InteractiveHTML iframe 渲染效果 | 用户选择：对齐 TauriTavern |
| D4 | 代码语法高亮 | **highlight.js (hljs)**——有 TauriTavern 参考，一步到位 | 用户要求 |
| D5 | 代码复制按钮 | **hljs 高亮后添加复制按钮**，参照 TauriTavern `addCopyToCodeBlocks()` | 基准对比需求 |
| D6 | 换行发送 | 移动端 Enter=换行 / 按钮发送；桌面端 Enter=发送 / Shift+Enter=换行 | 用户选择：选项1 |
| D7 | 用户气泡分段 | **用户消息也支持 segmentBubbles 按 \n 分段** | 用户确认 |
| D8 | 消息操作栏触发 | **桌面端右键菜单**（contextmenu）/**移动端长按**（pointer 长按 400ms） | 用户选择 |
| D9 | 消息复制/编辑 | 底部滑出窗口（vaul Drawer）显示 **Markdown 原始文本**，编辑后保存重新渲染 | 用户确认 |
| D10 | 消息删除 | 二次弹窗确认后删除 | 用户确认 |
| D11 | 重新生成 | **只重新生成这条 AI 回复**（保留历史，新回复加入分支） | 用户选择 |
| D12 | 导出设计 | 底部抽屉（参考 RikkaHub ChatExportSheet）：默认全选、可勾选消息、Markdown 格式、可选带/不带思考链、**过滤 tool 消息** | 用户选择：参考 RikkaHub |
| D13 | 分支/滑动 | **RikkaHub 风格**：消息底部 ◀ N/M ▶ 小箭头切换。美化设置加「是否显示分支箭头」开关（AgentDisplayConfig.showBranchArrows） | 用户选择 |
| D14 | 推理耗时 | token 数旁显示 **Timer 图标**（Phosphor Icons `Timer`）+ reasoningDuration，美化的显示选项加开关 | 用户确认 |
| D15 | 流式动画 | **逐词 fadeIn**（参考 RikkaHub Streamdown `animated: fadeIn`） | 用户要求 |
| D16 | 流式暂停/恢复 | **保持当前 abort 机制**。真正的暂停/恢复 LLM API 不支持——用户实测 DeepSeek 暂停即截断，需重新发送 | 访谈澄清 |
| D17 | 多对话生成 | **放在 Phase 4（本次最后）**，与主动消息共享后台任务管理器底座 | 用户选择 |
| D18 | 收藏 | 先留接口（`favorite?: boolean`），后续引入「密匣」新 APP | 用户指示 |
| D19 | 翻译/双语显示 | 延后。可能属于美化功能（同一气泡内中外文用分隔线隔开），非独立翻译 | 用户指示 |
| D20 | 文件附件 | 先留接口（图片上传+OCR 占位），等设置 APP 完善 | 用户选择 |
| D21 | TTS 语音消息 | 延后。LLM 调用 TTS 工具发送语音条，显示为可点击播放的语音波形而非文字。技术复杂，后续独立 Phase | 用户指示 |

### 1.2 延后记录（不在本次开发范围内）

| 功能 | 延后原因 | 预留措施 |
|------|---------|---------|
| 文件附件（图片上传+OCR） | 依赖设置 APP API 预设的 OCR 模型配置 | 功能盒预留入口 |
| TTS 语音消息 | 技术复杂，需录音权限+ASR+TTS 全套 | ChatInput 预留附件按钮位置 |
| 翻译/双语显示 | 用户考虑后续以美化功能实现 | 消息操作栏预留选项位 |
| 收藏 | 用户计划新建「密匣」APP | Message 类型加 `favorite?: boolean` |

---

## 二、架构变更概览

### 2.1 数据流变化

```
改造前：
  SQLite (.db) ←→ persistence ←→ Zustand store (全量消息)
                                      ↑
                                ChatView (slice(-visibleCount))
                                use-send-message (读全量)
                                InlineSearch (读全量 + DOM id 查找)

改造后：
  SQLite (.db) ←→ persistence (唯一数据源)
                    ↓
              ┌─────┴──────────────────────────┐
              ↓                                ↓
    Zustand store (视图缓存)          上下文拼装/LLM 调用
    只存窗口内 ~100 条                  直接从 SQLite 查全量
              ↓
        ChatView (窗口化渲染)
        InlineSearch (SQLite 全量搜索)
```

### 2.2 新增/修改模块

```
新增文件：
  src/services/chat-message-db.ts        # SQLite 消息分页查询接口
  src/apps/chat/components/MessageContextMenu.tsx  # 右键/长按菜单
  src/apps/chat/components/ExportDrawer.tsx        # 导出底部抽屉
  src/apps/chat/components/MessageEditDrawer.tsx   # 编辑底部窗口
  src/apps/chat/components/HighlightedText.tsx     # 搜索高亮共享组件
  src/apps/chat/pages/ChatSearchPage.tsx           # 智能体内全局搜索页面
  src/services/highlight/                # hljs 封装

修改文件：
  src/apps/chat/components/ChatView.tsx          # 窗口化渲染
  src/apps/chat/components/ChatInput.tsx          # 换行逻辑
  src/apps/chat/components/MessageRenderer.tsx    # 流式 HTML 检测 + 分支箭头
  src/apps/chat/components/MarkdownRenderer.tsx   # hljs 高亮 + 复制按钮 + HTML 延迟渲染
  src/apps/chat/components/InteractiveHTML.tsx    # 修复高度自适应
  src/apps/chat/components/InlineSearch.tsx       # SQLite 搜索 + DOM 映射
  src/apps/chat/components/ConversationList.tsx   # 搜索增强
  src/apps/chat/components/ChainOfThought.tsx     # 推理耗时显示
  src/apps/chat/types.ts                          # 新增字段
  src/apps/chat/store/chat-store.ts               # 消息缓存策略 + 分支/收藏
  src/hooks/use-send-message.ts                   # 流式动画 + 分支持久化
  src/index.css                                   # 新增样式块
```

---

## 三、Phase 1：窗口化聊天 + 搜索修复 + 换行修复（基础设施）

### 3.1 窗口化聊天

**目标**：ChatView 始终只渲染窗口内 ~100 条消息，滚顶加载更早消息，回收尾部 DOM。

**技术方案**：

```
┌─ SQLite 查询接口 ────────────────────────┐
│ getWindowMessages(convId, offset, limit)  │ → 返回 { messages, total }
│ searchMessages(convId, query)             │ → 返回 { messages, total }
│ getRecentMessages(convId, limit)          │ → 用于 LLM 上下文组装
└──────────────────────────────────────────┘

ChatView 窗口状态：
  windowStart: number       // 窗口起始 offset
  windowSize: number = 100  // 窗口大小
  totalCount: number        // 总消息数

加载流程：
  1. 初始化 → getWindowMessages(convId, max(0, total-100), 100) → 显示
  2. 滚到顶部 → getWindowMessages(convId, windowStart-50, 50) → 插入前端
  3. 窗口超过 150 条 → 回收尾部 50 条（切片 windowStart 前移）
  4. 新消息到达 → 追加到窗口尾部，若在底部则自动滚动
```

**注意**：
- 上下文拼装（use-send-message.ts）始终从 SQLite 查最近 N 条（`getRecentMessages`），不受窗口限制
- ContextPreviewPage 也从 SQLite 读取全量
- 切换对话时重置窗口

### 3.2 搜索功能设计（对标 RikkaHub 双搜索）

RikkaHub 有两处搜索，我们的设计完全对齐：

#### 搜索 A：聊天界面顶栏 → 搜索当前对话

**对标**：RikkaHub `ChatListPreview`（`ChatList.kt:597-714`）

**触发**：点击聊天界面顶栏搜索按钮（MagnifyingGlass）→ 顶栏切换为 InlineSearch 搜索框

**交互流程**：
```
┌─────────────────────────────────────────┐
│ [🔍 搜索本对话...                  ✕] │ ← 替换顶栏，自动聚焦
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 对话标题                      时间  │ │
│ │ ...片段文字[关键词]片段文字...     │ │ ← 关键词高亮
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 对话标题                      时间  │ │
│ │ ...片段文字[关键词]片段文字...     │ │
│ └─────────────────────────────────────┘ │
│           （消息卡片列表）              │
└─────────────────────────────────────────┘
```

**技术实现**：
1. 搜索源：从 SQLite 查询当前对话的全部消息（`SELECT ... FROM messages WHERE conversation_id = ? AND role != 'tool' AND content LIKE ?`）
2. 片段提取（参考 RikkaHub `extractMatchingSnippet`）：
   - 找到关键词首次出现位置 → 从该位置向前截取 60 字（或到消息开头）
   - 如关键词不在开头 → 前面加 `...`
3. 关键词高亮（参考 RikkaHub `buildHighlightedText`）：
   - 遍历文本，匹配词包裹 `<mark class="search-highlight">`
4. 结果卡片（参考 RikkaHub `ChatListPreview` 的 Surface 卡片）：
   - 用户消息右对齐 + 主题色背景 / 助手消息左对齐 + 次要色背景
   - 单行显示（`maxLines=1, overflow=ellipsis`）
   - 底部显示时间
5. 点击跳转：
   - 目标消息在窗口内 → 直接 `scrollIntoView({ behavior: 'smooth', block: 'center' })`
   - 目标消息不在窗口内 → 从 SQLite 加载包含该消息的窗口 → 渲染后 scrollIntoView
6. 前置依赖：
   - ChatView 每条消息 DOM 添加 `id="msg-{messageId}"`
   - 消息需要 `data-message-id` 属性用于查找

#### 搜索 B：对话列表栏 → 搜索该智能体所有对话

**对标**：RikkaHub `MessageSearch`（`SearchPage.kt` + `MessageFtsManager.kt`）

**触发**：对话列表（ConversationList）中点击搜索图标 → 导航到独立搜索页面 `/chat/search/:agentId`

**交互流程**：
```
┌─────────────────────────────────────────┐
│ ← 搜索消息                （自动聚焦）   │
├─────────────────────────────────────────┤
│ [🔍 输入关键词搜索...              ✕  ] │ ← 搜索框
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 对话标题：XXX                 时间  │ │
│ │ ...片段文字[关键词]片段文字...     │ │ ← 关键词高亮
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 对话标题：YYY                 时间  │ │
│ │ ...片段文字[关键词]片段文字...     │ │
│ └─────────────────────────────────────┘ │
│           （搜索结果列表）              │
│                                         │
│           （空状态：无匹配结果）         │
└─────────────────────────────────────────┘
```

**技术实现**：
1. 新建页面：`src/apps/chat/pages/ChatSearchPage.tsx`
2. 数据查询（SQLite）：
   ```sql
   SELECT m.id, m.content, m.conversation_id, m.timestamp, m.role,
          c.title as conversation_title
   FROM messages m
   JOIN conversations c ON m.conversation_id = c.id
   WHERE c.agent_id = ? AND m.role != 'tool' AND m.content LIKE ? COLLATE NOCASE
   ORDER BY m.timestamp DESC
   LIMIT 50
   ```
3. 片段提取：取关键词前后各 30 字（共约 60 字），超出部分加 `...`
4. 关键词高亮：`<mark class="search-highlight">` 包裹所有匹配
5. 结果卡片（参考 RikkaHub `SearchResultItem`）：
   - 对话标题（加粗，可点击跳转到该对话）
   - 消息片段 + 高亮
   - 消息时间
   - 角色标识（用户/助手）
6. 点击结果 → `navigate('/chat/${agentId}?convId=${conversationId}&jumpToMsg=${messageId}')`
   → ChatPage 读取 URL 参数 → 加载对应对话 + 窗口定位到目标消息
7. 空状态：输入无匹配时显示「未找到相关消息」提示

#### 统一高亮组件

提取为共享组件 `src/apps/chat/components/HighlightedText.tsx`：
```typescript
interface Props {
  text: string;
  query: string;
  maxLength?: number;  // 截取片段长度
}
// 逻辑：找关键词位置 → 截取上下文 → 用 <mark> 包裹所有匹配 
```
两处搜索复用同一组件。

### 3.4 换行发送修复

**当前 Bug**：`handleKeyDown` 中 `e.key === 'Enter' && !e.shiftKey` → 移动端软键盘换行键被映射为 Enter

**修复**：

```typescript
// ChatInput.tsx
const isMobile = /* isNative() || touch device detection */;

const handleKeyDown = (e: React.KeyboardEvent) => {
  if (isMobile) {
    // 移动端：Enter 永远换行（默认 textarea 行为），不拦截
    return;
  }
  // 桌面端：Enter 发送，Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
};
```

### 3.5 用户消息分段

**要求**：用户消息也支持 `segmentBubbles` 按 `\n` 分段显示。

**改动**：MessageRenderer 的 `renderSegmented()` / `renderContinuous()` 中移除 `isAssistant` 的条件限制——分段逻辑对用户和助手消息同等生效。

---

## Phase 2：代码块 + HTML 渲染 + 流式动画（渲染优化）

### 4.1 代码块语法高亮（highlight.js）

**依赖**：`npm install highlight.js`

**参考**：TauriTavern `code-highlight-coordinator.js`

**实现**：
1. 新建 `src/services/highlight/index.ts`：包装 hljs，支持懒加载
2. 新建 `src/services/highlight/code-copy.ts`：复制按钮逻辑
3. MarkdownRenderer 中 `<pre><code>` 组件：检测语言 → hljs.highlight() → `<code class="hljs">` + 复制按钮

**懒加载策略**（参考 TauriTavern）：
- hljs 核心库延迟 `import()`
- 代码块使用 IntersectionObserver（rootMargin: 300px）按需高亮
- 高亮后自动添加复制按钮

### 4.2 HTML 渲染：流式代码 → 完毕渲染

**改动文件**：`MarkdownRenderer.tsx`

**逻辑**：
```
<pre> 检测到 language-html 代码块
  ├─ 消息 status === 'sending'（流式生成中）
  │   └─ 渲染为 <pre><code class="hljs language-html">（带语法高亮 + 复制按钮）
  │       旁边显示「正在生成...」提示
  └─ 消息 status !== 'sending'（生成完毕）
      └─ 自动切换为 <InteractiveHTML html={code} />
```

**需要传递**：MarkdownRenderer 需要感知消息的 `status` 字段。当前 MarkdownRenderer 不接收 status prop——需要新增。

### 4.3 InteractiveHTML 高度自适应修复

**问题**：不完整 HTML 或错误 HTML 导致 iframe 高度异常（崩坏/无限滚动）。

**修复**：
1. `minHeight: 220px` → 改为更大的默认值（如 400px）
2. `maxHeight` 限制，超过时 iframe 内部滚动（兜底）
3. postMessage 高度报告超时机制：3 秒内无报告 → 使用 fallback 高度
4. 渲染错误时显示错误提示而非空白

### 4.4 流式逐词动画

**参考**：RikkaHub Streamdown `animated={{ animation: "fadeIn", sep: 'word', duration: 150 }}`

**实现**：在 `use-send-message.ts` 的流式更新逻辑中，逐 chunk 追加文本时使用 CSS transition：
- 新追加的文本片段包裹在 `<span class="stream-fade-in">` 中
- CSS: `@keyframes streamFadeIn { from { opacity: 0; } to { opacity: 1; } }`
- 每个片段 animation-delay 递增

**注意**：只在流式生成中（status='sending'）启用动画，历史消息加载时不需要。

---

## Phase 3：消息操作栏 + 分支 + 推理耗时（消息交互）

### 5.1 消息操作栏

#### 触发方式

| 平台 | 触发 | 实现 |
|------|------|------|
| 桌面端 | 右键（contextmenu） | `onContextMenu` → `e.preventDefault()` → 显示菜单 |
| 移动端 | 长按 400ms | Pointer Events 计时器（复用桌面拖拽的长按逻辑） |

#### 菜单项

| 操作 | 交互 | 实现 |
|------|------|------|
| **复制** | 底部滑出窗口显示 Markdown 原始文本，顶部「复制」按钮 → `navigator.clipboard.writeText()` | `MessageEditDrawer` 只读模式 |
| **编辑** | 底部滑出窗口显示 Markdown 原始文本（可编辑 textarea），底部「取消」「确认」按钮 | `MessageEditDrawer` 编辑模式 → 更新 store |
| **删除** | 弹窗二次确认 → 删除消息 | `window.confirm` 或自定义 AlertDialog |
| **重新生成** | 只重新生成这条 AI 回复（新回复加入分支），保留历史 | `handleRegenerate(msgId)` → use-send-message |
| **导出** | 底部抽屉（`ExportDrawer`），参考 RikkaHub ChatExportSheet | 见 5.2 |
| **收藏** | 接口预留（点击切换 `favorite` 状态，视觉上显示收藏标记） | 不实现逻辑，只改类型+UI |

#### 已被右键菜单替换的旧操作

**注意**：当前聊天界面顶部有搜索按钮和智能体设定按钮。消息操作栏不取代这些——它是针对**单条消息**的操作入口。

### 5.2 导出功能

**参考**：RikkaHub `ChatExportSheet`（`Export.kt:114-241`）

**设计**：
```
┌─────────────────────────────────────┐
│  导出对话                  ✕ 关闭   │
├─────────────────────────────────────┤
│  格式：Markdown                      │
│                                     │
│  选择消息：                          │
│  ☑ 全选                             │
│  ☑ User: 你好...              [✓]  │
│  ☑ Assistant: 你好！...       [✓]  │
│  ☑ User: 帮我写...            [✓]  │
│  ☐ Tool: search_web...       [✗]  │  ← 默认不选 tool 消息
│                                     │
│  选项：                             │
│  ☑ 包含思考链                       │
│                                     │
│  [取消]              [导出 Markdown]│
└─────────────────────────────────────┘
```

**Markdown 格式**（参考 RikkaHub `exportToMarkdown`）：
```markdown
# 对话标题
*Exported on 2026-07-21*

**User**:
你好

---

**Assistant**:
你好！有什么可以帮你的？

---

**User**（re-rolled 2/3）:
换个问法...
```

- 每条消息以 `**角色名**:` 开头
- `---` 分隔
- 思考链：`> 推理内容`（引用格式）
- 工具调用：`**Tool**: \`toolName\`` + Input/Output（含内容时按类别显示）

### 5.3 分支/滑动

**数据模型变更**：

```typescript
// 当前 Message 不变
// 分支通过「同一 user message 下的多条 assistant message」来表达
// 新增辅助结构：

interface MessageBranch {
  parentId: string;           // 触发分支的用户消息 ID
  siblings: string[];         // 该位置的所有 assistant 消息 ID（按时间排序）
  activeIndex: number;        // 当前显示的分支索引
}
```

或者更简单的方式——在 Message 上加字段：

```typescript
interface Message {
  // ...现有字段
  branchParentId?: string;    // 如果是分支，指向原始 AI 消息的 ID（或用户消息 ID）
  branchIndex?: number;       // 该分支在同组中的序号
  branchTotal?: number;       // 同组分支总数
}
```

**UI**（RikkaHub 风格）：
```
┌──────────────────────────────────┐
│  [AI 头像]  AI 回复内容...        │
│  ─────────────────────────────── │
│         ◀ 2 / 4 ▶               │  ← 仅当 branchTotal > 1 时显示
└──────────────────────────────────┘
```

**显示开关**：`AgentDisplayConfig.showBranchArrows: boolean`（默认 true）

### 5.4 推理耗时

**数据来源**：`use-send-message.ts` 流式生成中记录 reasoning token 的首尾时间戳。

```typescript
interface Message {
  // ...现有字段
  reasoningDuration?: number;  // 推理耗时（ms）
}
```

**UI**：
```
↑2864 ↓521 · 命中1054 · ⏱ 3.2s
```
- ⏱ 使用 Phosphor Icons `Timer`（线条图标）
- 仅当消息有 reasoning content 且 duration > 0 时显示
- 显示开关：`AgentDisplayConfig.showReasoningDuration: boolean`（默认 false，放在美化的显示选项列表）

---

## Phase 4：后台任务管理器 + 多对话生成 + 主动消息（最后阶段）

### 6.1 后台任务管理器

**新建**：`src/services/background-task/`

```
BackgroundTaskManager
  ├── tasks: Map<taskId, TaskState>
  ├── startTask(conversationId, agentId, prompt?)
  ├── cancelTask(taskId)
  ├── onTaskComplete(taskId, result)
  └── notifyUser(taskId)  → APP内弹窗 + 手机通知栏
```

**设计要点**：
- 生成任务独立于 React 组件生命周期
- 使用 `useRef` + `useEffect` 清理防止内存泄漏
- Capacitor Local Notifications 推送

### 6.2 多对话同时生成

- 用户切换对话时，当前对话的生成不中断
- 后台生成完成 → 如果用户在对应对话页 → 消息直接追加
- 后台生成完成 → 如果用户不在对应对话页 → 弹出通知
- ChatInput 的「停止」按钮只停止当前对话的生成

### 6.3 主动消息

- 事件总线监听 → 触发后台生成 → 推送到对应智能体的最近对话窗口
- 复用的就是 BackgroundTaskManager 底座

---

## 七、类型定义变更汇总

```typescript
// === types.ts 新增/修改 ===

interface Message {
  // ...现有字段不变
  reasoningDuration?: number;    // Phase 3: 推理耗时
  favorite?: boolean;            // Phase 3: 收藏（接口预留）
  branchParentId?: string;       // Phase 3: 分支
  branchIndex?: number;
  branchTotal?: number;
}

interface AgentDisplayConfig {
  // ...现有字段
  showBranchArrows?: boolean;         // Phase 3: 分支箭头开关（默认 true）
  showReasoningDuration?: boolean;    // Phase 3: 推理耗时开关（默认 false）
}
```

---

## 八、CSS 样式新增清单

| 样式块 | 用途 | Phase |
|--------|------|-------|
| `.hljs` 全套 | 代码语法高亮（引入 highlight.js 主题 CSS） | 2 |
| `.code-block__copy` | 代码块复制按钮 | 2 |
| `.stream-fade-in` | 流式逐词动画 | 2 |
| `.msg-context-menu` | 右键菜单浮层 | 3 |
| `.msg-context-menu__item` | 菜单项 | 3 |
| `.msg-edit-drawer` | 编辑底部窗口（vaul Drawer 变体） | 3 |
| `.export-drawer` | 导出底部抽屉 | 3 |
| `.branch-arrows` | 分支切换箭头 | 3 |
| `.reasoning-duration` | 推理耗时显示 | 3 |
| `.msg-favorite` | 收藏标记 | 3 |

---

## 九、测试要点

| Phase | 测试项 | 验收标准 |
|-------|--------|---------|
| 1 | 窗口化聊天 | 100+ 条消息对话：滚顶加载更早消息不失位；切换对话窗口重置；上下文拼装不受窗口限制 |
| 1 | 对话内搜索 | 搜索关键词 → 显示匹配消息卡片列表（片段+高亮）；点击跳转到目标消息；消息不在窗口内时自动加载 |
| 1 | 智能体全局搜索 | 从对话列表进入搜索页面；搜索该智能体所有对话的消息；结果含对话标题+片段+高亮+时间；点击跳转定位 |
| 1 | 对话栏搜索 | 搜索对话标题正确过滤 |
| 1 | 换行发送 | 移动端 Enter 换行不发送；桌面端 Enter 发送/Shift+Enter 换行；用户按 \n 分段显示 |
| 2 | 代码高亮 | 多种语言代码块正确高亮；复制按钮工作 |
| 2 | HTML 渲染 | 流式过程显示代码；生成完毕自动渲染；不完整 HTML 不崩坏 |
| 2 | 流式动画 | 生成中文字逐词淡入 |
| 3 | 右键菜单 | 桌面端右键弹出；移动端长按弹出 |
| 3 | 复制/编辑 | 底部窗口显示 Markdown 原文；编辑保存后重新渲染 |
| 3 | 删除 | 二次确认 → 消息消失 |
| 3 | 重新生成 | 新回复加入分支；箭头出现可切换 |
| 3 | 导出 | 默认全选可勾选；Markdown 格式正确；tool 消息排除；可带/不带思考链 |
| 3 | 推理耗时 | Token 数旁显示 Timer 图标 + 秒数 |
| 4 | 后台生成 | 切对话生成不中断；完成弹窗通知 |
| — | 回归 | npm run build 通过；APK 打包成功；已有 5 个 APP 功能不受影响 |

---

## 十、依赖安装

```bash
npm install highlight.js
# 无其他新依赖。Phosphor Icons 已有 Timer 图标。
```

---

## 十一、不做的功能（避免范围蔓延）

| 功能 | 决定 |
|------|------|
| TTS 语音消息/语音气泡 | 延后，记录需求 |
| 文件附件上传+OCR | 接口预留，功能延后 |
| 翻译/双语显示 | 延后 |
| 暂停/恢复（真正语义） | LLM API 不支持，维持 abort |
| LaTeX 数学公式 | 本次不做（两个参考项目用的方案不同：remarkMath vs $$ 转换，需单独调研） |
| 消息已读回执（✓✓） | 已有，不在此次范围 |
| 虚拟滚动 | 已放弃，用窗口化替代 |
