# RikkaHub 聊天系统学习笔记

> 基于 RikkaHub 主仓库（`C:\refs\rikkahub-master`）的源码分析。
> 学习日期：2026-07-17
> 目的：为香蕉牛奶机聊天 APP 的下一轮优化提供技术参考——消息渲染、工具调用展示、多轮 tool calling、消息操作。

---

## 目录

1. [消息内容类型系统（UIMessagePart）](#1-消息内容类型系统uimessagepart)
2. [Markdown / HTML 渲染引擎](#2-markdown--html-渲染引擎)
3. [消息分组与渲染流程](#3-消息分组与渲染流程)
4. [工具调用 UI 展示（ToolUIRegistry）](#4-工具调用-ui-展示tooluiregistry)
5. [ChainOfThought 时间线卡片](#5-chainofthought-时间线卡片)
6. [多轮 Tool Calling 循环（GenerationHandler）](#6-多轮-tool-calling-循环generationhandler)
7. [消息操作（复制/重新生成/编辑）](#7-消息操作复制重新生成编辑)
8. [搜索结果展示](#8-搜索结果展示)
9. [思考链（Reasoning）展示](#9-思考链reasoning展示)
10. [审批流程（Tool Approval）](#10-审批流程tool-approval)
11. [我们与 RikkaHub 的差距分析](#11-我们与-rikkahub-的差距分析)

---

## 1. 消息内容类型系统（UIMessagePart）

**文件：`ai/src/main/java/me/rerere/ai/ui/Message.kt`**

RikkaHub 的消息体是 `UIMessage`，内部包含 `parts: List<UIMessagePart>`——**一条消息可以同时包含多种内容类型**。

### UIMessagePart sealed class 继承体系

| 类型 | 序列化名 | 关键字段 | 用途 |
|------|---------|---------|------|
| `UIMessagePart.Text` | `"text"` | `text: String` | 文本内容（**Markdown 格式**） |
| `UIMessagePart.Image` | `"image"` | `url: String` | 图片（URL 或 base64） |
| `UIMessagePart.Video` | `"video"` | `url: String` | 视频文件 |
| `UIMessagePart.Audio` | `"audio"` | `url: String` | 音频文件 |
| `UIMessagePart.Document` | `"document"` | `url, fileName, mime` | 文档文件（PDF, docx 等） |
| `UIMessagePart.Reasoning` | `"reasoning"` | `reasoning, createdAt, finishedAt` | AI 推理/思考过程 |
| `UIMessagePart.Tool` | `"tool"` | `toolCallId, toolName, input, output, approvalState` | **工具调用（核心）** |

### 核心设计理念

**一条 ASSISTANT 消息的 parts 可能像这样：**
```
UIMessage(role=ASSISTANT)
  parts:
    [0] UIMessagePart.Reasoning("我需要搜索一下当前新闻...")
    [1] UIMessagePart.Tool(toolName="search_web", input='{"query":"latest news"}', output=[...], isExecuted=true)
    [2] UIMessagePart.Text("根据搜索结果，最新消息是...")
    [3] UIMessagePart.Image(url="https://example.com/news.jpg")
```

关键特点：
- **不创建独立的 TOOL 角色消息**——工具调用和结果内联在 ASSISTANT 消息中
- **一条消息可以有多个 part**——文本、推理、工具调用交替出现
- **`Tool.output` 是 `List<UIMessagePart>`**——工具结果本身也可以包含文本、图片等

### 与香蕉牛奶机的对比

| 维度 | RikkaHub | 我们当前 |
|------|----------|---------|
| 消息 parts | `List<UIMessagePart>`（多类型混合） | `Message.content: string`（纯文本） |
| 工具结果 | 内联在 ASSISTANT 消息的 Tool part 中 | 独立的 tool 角色消息 |
| 推理链 | 独立的 `Reasoning` part | 每轮回复最开头的文本 |
| 富文本 | Markdown 格式文本 | 纯文本 |

---

## 2. Markdown / HTML 渲染引擎

**文件：`app/.../ui/components/richtext/Markdown.kt`、`MarkdownNew.kt`**

### 渲染管线

```
原始文本
  ↓ preProcess() — LaTeX 公式转换，跳过代码块
  ↓ parseMarkdown() — IntelliJ Markdown Parser (GFMFlavourDescriptor)
  ↓ AST 分析
  ├── 含 HTML → MarkdownNew 路径（Jsoup 解析 HTML）
  └── 纯 Markdown → MarkdownNode 路径（Compose 原生组件）
```

### MarkdownNode 支持的 AST 节点

| 类型 | 渲染组件 |
|------|---------|
| 段落 | `Text` 组合 |
| 标题 1-6 | 不同字号 + 粗体 |
| 有序/无序列表 | 递归嵌套渲染 |
| 复选框 | `[x]` / `[ ]` 样式 |
| 引用块 | 左侧竖线装饰 |
| 代码块 | `HighlightCodeBlock`（语法高亮） |
| 行内样式 | 粗体/斜体/删除线/链接/行内代码 |
| 表格 | `DataTable` 组件 |
| LaTeX 公式 | `LatexText` / `MathBlock` |
| Mermaid 图表 | `Mermaid` 组件 |
| 引用标注 | `[citation:id]` → 可点击跳转 URL |

### HTML 路径（MarkdownNew）

当 Markdown 中包含 HTML 标签时，走此路径：
1. `HtmlGenerator` 生成 HTML
2. `Jsoup` 解析回 DOM 树
3. 逐节点渲染（`<p>`, `<h1>-<h6>`, `<ul>/<ol>`, `<pre>`, `<blockquote>`, `<table>`, `<hr>`, `<img>`）

### WebView Preview

RikkaHub 还提供 **WebView 预览模式**：`buildMarkdownPreviewHtml()` 将 Markdown 转为完整 HTML 页面，用 WebView 渲染，支持 marked.js、KaTeX、Mermaid、highlight.js。

### 对香蕉牛奶机的启示

**React 生态下**实现 Markdown 渲染的推荐方案：
- 使用 `react-markdown`（基于 unified/remark/rehype 生态）
- 或 `marked` + 自定义渲染器
- 需要支持：代码高亮（`react-syntax-highlighter`）、LaTeX（`katex`）、表格、列表、引用块

消息内容必须是 `content: string`（Markdown 格式），而非纯文本。

---

## 3. 消息分组与渲染流程

**文件：`app/.../ui/components/message/ChatMessage.kt`、`ChatMessageCot.kt`**

### 分组机制

`groupMessageParts()` 将 `List<UIMessagePart>` 分为两种 block：

```
输入：[Text, Reasoning, Tool, Tool, Text, Image]
       ↓ groupMessageParts()
输出：[ContentBlock(text), ThinkingBlock(reasoning, tool, tool), ContentBlock(text), ContentBlock(image)]
```

- **ThinkingBlock**：连续的 Reasoning + Tool parts 合并为一个思维块
- **ContentBlock**：Text / Image / Video / Audio / Document 各自独立

### 渲染顺序

```
MessagePartsBlock
  ├── ThinkingBlock → ChainOfThought 卡片（时间线样式）
  │     ├── ReasoningStep → ChatMessageReasoningStep（蓝色思考内容）
  │     └── ToolStep → ChatMessageToolStep（工具调用卡片）
  ├── ContentBlock(Text) → MarkdownBlock 渲染
  ├── ContentBlock(Image) → ZoomableAsyncImage
  ├── ContentBlock(Video/Audio/Document) → 图标 + 文件名
  └── Annotations → 折叠引用来源列表
```

---

## 4. 工具调用 UI 展示（ToolUIRegistry）

**文件：`app/.../ui/components/tool/ToolUI.kt`、`BuiltinToolUIs.kt`**

### 插件式渲染架构

```kotlin
interface ToolUIRenderer {
    fun icon(): @Composable () -> Unit      // 左侧图标
    fun title(step: ToolStep): String        // 标题
    fun hasSummary(): Boolean                // 是否有摘要
    fun Summary(step: ToolStep)              // 折叠态摘要内容
    fun Preview(step: ToolStep)              // 展开态详情（BottomSheet）
}
```

通过 `ToolUIRegistry` 注册，按 `toolName` 查找渲染器：

```kotlin
object ToolUIRegistry {
    private val renderers = mutableMapOf<String, ToolUIRenderer>()
    
    fun register(toolName: String, renderer: ToolUIRenderer) { ... }
    fun resolve(toolName: String): ToolUIRenderer = renderers[toolName] ?: DefaultToolUIRenderer
}
```

### 已注册的专用渲染器（15+）

| 工具名 | 图标 | 摘要 | 详情预览 |
|--------|------|------|----------|
| `search_web` | 🔍 | answer + favicon + 结果数 | 搜索结果卡片列表 |
| `scrape_web` | 🌐 | URL | 网页 Markdown 内容 |
| `memory_tool` | ✏️ | 记忆内容文本 | JSON + 删除按钮 |
| `get_time_info` | 🕐 | 无摘要 | JSON |
| `clipboard_tool` | 📋 | 无摘要 | JSON |
| `text_to_speech` | 🔊 | 朗读文本 + 重播 | JSON |
| `get_screen_time` | 📱 | 总时长 + 前3应用 | 应用列表+占比条 |
| `workspace_edit_file` | 📝 | diff统计 | 完整 diff 视图 |
| `workspace_shell` | 💻 | 命令+状态码 | 输出内容 |

**未注册的工具**使用 `DefaultToolUIRenderer`：标题 "Called tool {name}"，详情 JSON 高亮。

### 对香蕉牛奶机的启示

给每个工具（网络搜索、MCP 工具、未来本地工具）注册独立的渲染器，实现：
- **搜索**：显示 answer 摘要 + 来源卡片列表 + favicon
- **MCP 工具**：JSON 格式输入/输出 + 可折叠详情
- **本地工具**：特定图标 + 结构化摘要

---

## 5. ChainOfThought 时间线卡片

**文件：`app/.../ui/components/message/ChainOfThought.kt`**

### 卡片结构

```
┌─ ChainOfThought ─────────────────────────┐
│ ○ 搜索：最新新闻          ▸ 展开/折叠     │  ← ChainOfThoughtStep
│ ○ 获取时间               ▸ 展开/折叠     │
│ ○ 分析结果...            ▸ 展开/折叠     │
│ [显示 3 个更多步骤]                       │  ← >2步时折叠
└──────────────────────────────────────────┘
```

### 关键行为

- **步骤 > `collapsedVisibleCount`（默认2）**时自动折叠，显示"显示 X 个更多步骤"
- 每步包含：
  - 左侧圆形图标（24dp）
  - 标题 label
  - 右侧 extra 信息（工具调用时显示审批按钮）
  - 内容区域（缩进 32dp）
- **正在执行的工具**：`DotLoading` 动画 + `Shimmer` 闪烁文字
- **已完成工具**：静态图标 + 摘要内容
- **点击卡片**：弹出 `ModalBottomSheet` 显示完整详情（Preview）

### 与香蕉牛奶机的对比

我们的工具卡片需要从当前的简单文本展示，改为：
1. 时间线风格的多步展示
2. 加载动画（呼吸灯）
3. 折叠/展开控制（最多显示 2 步，其余折叠）
4. 点击查看详情（BottomSheet/弹窗）

---

## 6. 多轮 Tool Calling 循环（GenerationHandler）

**文件：`app/.../data/ai/GenerationHandler.kt`**

### 核心循环

```kotlin
fun generateText(maxSteps: Int = 256): Flow<GenerationChunk> = flow {
    for (stepIndex in 0 until maxSteps) {
        // 阶段 A：LLM 调用
        val messages = generateInternal(...)
        emit(GenerationChunk.Messages(messages))
        
        // 阶段 B：检查工具
        val pendingTools = messages.last().getTools().filter { !it.isExecuted }
        if (pendingTools.isEmpty()) break  // 无工具 → 生成结束
        
        // 阶段 C：审批检查
        for (tool in pendingTools) {
            if (tool.needsApproval && tool.approvalState == Auto) {
                tool.approvalState = Pending
                break  // 等待用户审批
            }
        }
        if (hasPending) break
        
        // 阶段 D：执行工具
        for (tool in pendingTools) {
            val result = toolDef.execute(tool.input)
            tool.output = result  // 内联写入
        }
        // 进入下一轮 Step
    }
}
```

### 关键设计

| 特性 | 实现 |
|------|------|
| **maxSteps** | 默认 256，防止无限循环 |
| **工具结果存放** | 内联在 ASSISTANT 消息的 Tool part 中（非独立 TOOL 消息） |
| **流式合并** | SSE delta 逐步到达 → `Tool.merge()` 累积 |
| **审批中断** | `Pending` 状态 → break 等待 → 恢复时跳过 LLM 调用直接执行 |
| **输出截断** | Shell 工具 >32KB 时截断为 4KB 预览 + 文件保存 |

### 消息内联结构示例

```
用户: "帮我查一下天气和新闻"
  ↓
Step 0: ASSISTANT [Tool(search_web, '{"query":"weather"}'), Tool(search_web, '{"query":"news"}')]
  → 执行两个搜索
  → 结果写入 Tool.output
  ↓
Step 1: ASSISTANT (含 Step 0 内联的工具结果)
  → LLM 看到结果 → 生成总结文本
  → 无更多工具 → break
  ↓
最终消息:
  ASSISTANT parts: [
    Text("好的，我来查一下"),
    Tool(search_web, output=[搜索结果]),
    Tool(search_web, output=[搜索结果]),
    Text("天气情况是...，新闻方面...")
  ]
```

### 对香蕉牛奶机的启示

我们当前的 `use-send-message.ts` 中的工具循环：
- ✅ 已有循环（最多 10 次迭代）
- ❌ 工具结果以 **独立 TOOL 消息** 添加到消息历史（不是内联）
- ❌ 缺少审批状态机
- ❌ LLM 调用、工具执行是线性序列，缺少每步 emit 更新 UI 的能力

需要改：
1. 消息类型扩展：`Message.parts` 从纯字符串改为 `MessagePart[]` 数组
2. 工具结果改为内联到 ASSISTANT 消息
3. 每步 emit 中间状态让 UI 实时更新

---

## 7. 消息操作（复制/重新生成/编辑）

### 复制

**文件：`ChatMessageActionButtons.kt`、`ChatMessageCopySheet.kt`**

- 快速复制：点击复制图标 → `message.toText()` 提取所有 Text parts
- 选择复制：弹出底部 Sheet，`SelectionContainer` 包裹
- `toText()` 仅提取 `UIMessagePart.Text`，跳过 Reasoning、Tool 等

### 重新生成

- 点击重新生成图标
- 用户消息：弹出确认对话框
- AI 消息：直接调用 `onRegenerate()`
- 底层：`ChatVM.regenerateAtMessage()` → `ChatService.regenerateAtMessage()`

### 编辑

- **`editingMessage`** 标识正在编辑的消息
- `setContents(contents)` 加载文本到 TextFieldState
- `getContents()` 重建编辑后的 parts
- 用户消息点击 → 进入编辑模式

### 操作菜单

`ChatMessageActionsSheet.kt` 包含：
- 选择复制
- WebView 预览（Markdown → HTML）
- 编辑 / 删除 / 分享
- 分叉（Fork）— 从此处开启新对话
- 收藏 / 翻译

---

## 8. 搜索结果展示

**文件：`BuiltinToolUIs.kt` — `SearchWebToolUI`**

### 摘要（inline 折叠态）

```
┌──────────────────────────────────────┐
│ 🔍 搜索：最新新闻                     │
│ 根据多个来源，最新新闻显示...（3行）  │
│ [icon][icon][icon]  来自 5 个来源     │
└──────────────────────────────────────┘
```

### 详情（BottomSheet 展开态）

```
┌──── SearchWebPreview ────────────────┐
│ 搜索查询: 最新新闻                     │
│ ┌────────────────────────────────┐    │
│ │ answer 总结（Markdown 渲染）     │   │
│ └────────────────────────────────┘    │
│ 结果列表:                             │
│ ┌─ 标题1 ─────────────────────────┐  │
│ │ 文本摘要（最多3行）               │  │
│ │ example.com                     │  │
│ └─────────────────────────────────┘  │
│ ┌─ 标题2 ─────────────────────────┐  │
│ │ ...                             │  │
│ └─────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### 关键设计点

- 搜索结果通过 `search_web` 工具返回 JSON，再由 ToolUIRenderer 解析展示
- **不是纯 JSON 展示**，而是结构化的卡片列表
- 每个结果显示：标题（加粗）+ 文本摘要（最多3行）+ URL（彩色）
- 来源网站 Favicon 横向排列
- `[citation:id]` 格式在 Markdown 文本中引用结果，点击跳转 URL
- **Annotations**：消息底部显示折叠的引用来源列表

---

## 9. 思考链（Reasoning）展示

**文件：`ChatMessageReasoning.kt`、`ThinkTagTransformer.kt`**

### ThinkTagTransformer

- 正则 `<think>...</think>` 提取思考内容为 `Reasoning` part
- 流式模式：`visualTransform()` 实时提取
- 完成模式：`onGenerationFinish()` 最终处理
- 未闭合的 `<think>` 在流式中也被处理

### 渲染状态

三种状态：`Collapsed` / `Preview` / `Expanded`

- **加载中**（`finishedAt == null`）：
  - 默认展开为 Preview 模式
  - 标题显示思考时间（实时更新 50ms）
  - 检测思考标题 → 动态标题动画
  - 内容 maxHeight=100dp + 渐变淡出
  - 自动滚动到底部
  
- **完成时**：
  - 如果 `autoCloseThinking` 启用 → 自动折叠
  - 否则保持展开

---

## 10. 审批流程（Tool Approval）

### 状态机

```
Auto → Pending → Approved / Denied / Answered
```

### 审批 UI

- **Pending** 状态：步骤右侧显示 ✅ 批准 / ❌ 拒绝按钮
- **Denied**：摘要区红色字体显示拒绝原因
- **Approved**：自动执行
- **Answered**（仅 `ask_user`）：用户答案文本

### 交互式工具（ask_user）

支持三种输入类型：`text`（带 Chip 选项）、`single`（单选）、`multi`（多选）

---

## 11. 我们与 RikkaHub 的差距分析

### 差距矩阵

| 维度 | RikkaHub | 香蕉牛奶机当前 | 优先级 |
|------|----------|--------------|--------|
| **消息内容类型** | `List<UIMessagePart>`（Text/Image/Tool/Reasoning 混合） | `content: string`（纯文本） | 🔴 |
| **Markdown 渲染** | IntelliJ Parser + Compose/Jsoup 双引擎 | 无（纯文本） | 🔴 |
| **工具结果内联** | 内联在 ASSISTANT 消息的 Tool part | 独立 TOOL 角色消息 | 🔴 |
| **多轮 tool calling** | `for` 循环，默认 256 步，每步 emit | 最多 10 次，无每步 UI 更新 | 🔴 |
| **工具 UI 展示** | 插件式 ToolUIRegistry（15+ 渲染器） | `ToolCard` 组件，无结构化展示 | 🔴 |
| **搜索结果显示** | 结构化卡片列表 + answer + favicon | JSON 文本展示 | 🔴 |
| **ChainOfThought** | 时间线卡片，自动折叠（>2步） | 无 | 🟡 |
| **消息操作** | 复制/编辑/重新生成/分叉/分享/翻译 | 无 | 🟡 |
| **思考链展示** | 独立 Reasoning part，三种折叠状态 | 文本最开头展示 | 🟡 |
| **审批流程** | 完整状态机 + UI | 无 | 🟢 |
| **工具加载动画** | DotLoading + Shimmer | 无 | 🟢 |

### 建议的优化顺序

1. **消息类型系统重构**（基础）— 从 `content: string` 改为 `parts: MessagePart[]`
2. **Markdown 渲染**（用户可见）— 引入 `react-markdown`
3. **工具调用 UI 改造**（用户感知最强）— ChainOfThought 卡片 + 搜索结构化展示
4. **多轮 tool calling UI 实时更新**（使用体验）— 每步 emit 状态
5. **消息操作**（编辑/复制/重新生成）
6. **审批流程**（后续迭代）

---

*本笔记基于 RikkaHub commit 源码分析，所有文件路径相对于 `C:\refs\rikkahub-master\`。*
