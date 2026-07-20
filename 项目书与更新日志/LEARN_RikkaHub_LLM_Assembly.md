# RikkaHub LLM 拼装机制 & 缓存原理 — 学习笔记

> 学习来源：`C:\refs\rikkahub-master`（RikkaHub 开源项目，Kotlin 原生 Android）
> 学习目的：为香蕉牛奶机的聊天 APP 功能盒提供架构参考

---

## 一、整体架构概览

RikkaHub 的 LLM 调用采用 **管道（Pipeline）+ Transformer** 模式：

```
用户输入
  → ChatService.sendMessage()       # 编排层
  → GenerationHandler.generateText()  # 生成引擎（含多步骤 Tool Call 循环）
  → generateInternal()                # 拼装层（拼装 messages）
    → transformers.transform()        # 转换层（注入、替换、OCR等）
  → Provider.streamText()             # API 调用层（拼装请求体）

结果返回路径：
  Provider.streamText() 流式输出
  → ChatService 收集
  → 持久化到 DB
  → UI 更新
```

---

## 二、核心：消息拼装顺序（generateInternal）

拼装在 `GenerationHandler.generateInternal()` 的 `buildList` 中完成：

```
buildList {
  val system = buildString {
    // 1. System Prompt（取自 assistant 或 conversation 自定义）
    append(effectiveSystemPrompt)

    // 2. 长期记忆（如果启用 memory）
    if (assistant.enableMemory) {
      append(buildMemoryPrompt(memories))
    }

    // 3. 每个工具的自定义 systemPrompt（例如搜索工具有额外的说明）
    tools.forEach { tool ->
      append(tool.systemPrompt(model, messages))
    }
  }

  // 4. 合并成一条 system message
  if (system.isNotBlank()) add(UIMessage.system(prompt = system))

  // 5. 用户+AI 历史消息（已截断）
  addAll(messages.limitContext(assistant.contextMessageSize))
}
```

**关键总结：静态在前，动态在后**
- **静态区块**（一次生成基本不变）：System Prompt + 记忆 + 工具定义
- **动态区块**（每次变化）：用户消息 ↔ AI 回复历史

这种结构对 Claude Prompt Caching 非常友好，因为静态区域可以缓存。

---

## 三、Transformer 管道机制

### 3.1 管道式调用

每个 Transformer 实现 `MessageTransformer` 接口，管道串联：

```
transforms() 内部：
  transformers.fold(this) { acc, transformer ->
      transformer.transform(ctx, acc)
  }
```

**输入管道**（`inputTransformers`，发送前处理）：
```
TimeReminderTransformer
  → PromptInjectionTransformer（ModeInjection + Lorebook 注入）
  → PlaceholderTransformer（占位符替换 {{time}} 等）
  → [TemplateTransformer]（模板处理）
  → [WorkspaceReminderTransformer]（工作空间提醒）
  → DocumentAsPromptTransformer（文档转提示词）
  → OcrTransformer（图片 OCR）
```

**输出管道**（`outputTransformers`，接收后处理）：
```
ThinkTagTransformer（think tag → reasoning parts）
  → Base64ImageToLocalFileTransformer（图片存本地）
  → RegexOutputTransformer（正则替换输出）
```

### 3.2 管道设计要点

- **职责单一**：每个 Transformer 只做一件事
- **可插拔**：通过 `buildList` 动态组装管道（可添加/移除）
- **顺序敏感**：顺序决定处理结果
- **调试友好**：可单独测试每个 Transformer

---

## 四、提示词注入系统（Mode Injection + Lorebook）

### 4.1 五种注入位置

| 位置 | 含义 | 使用场景 |
|------|------|---------|
| `BEFORE_SYSTEM_PROMPT` | 系统提示词前 | 全局前置指令 |
| `AFTER_SYSTEM_PROMPT` | 系统提示词后 | 特定技能注入 |
| `TOP_OF_CHAT` | 第一条用户消息前 | 行为引导 |
| `BOTTOM_OF_CHAT` | 最后一条消息前 | 即时指令 |
| `AT_DEPTH` | 指定深度（从最新往前数） | 上下文位置控制 |

### 4.2 Lorebook 触发机制

```
enabledLorebooks.forEach { lorebook ->
    lorebook.entries
        .filter { entry ->
            val context = extractContextForMatching(nonSystemMessages, entry.scanDepth)
            entry.isTriggered(context)  // 正则/关键词匹配
        }
        .forEach { injections.add(it) }
}
```

- `scanDepth`：只扫描最近 N 条消息
- `isTriggered`：基于关键词或正则触发
- 未触发的不注入，节省 tokens

### 4.3 考虑组播商的约束

```kotlin
internal fun findSafeInsertIndex(messages: List<UIMessage>, targetIndex: Int): Int {
  // 不能插入到 USER → ASSISTANT(含Tool) 之间
  // DeepSeek 等要求 USER 后紧跟带工具的 ASSISTANT
  // 否则会报错或破坏推理连续性
}
```

---

## 五、Tool Call 系统

### 5.1 工具来源

| 来源 | 创建函数 | 条件 |
|------|---------|------|
| 搜索 | `createSearchTools(settings)` | `settings.enableWebSearch` |
| 记忆 | `buildMemoryTools(...)` | `assistant.enableMemory` |
| 历史对话 | `createConversationTools(...)` | `assistant.enableRecentChatsReference` |
| 工作空间 | `createWorkspaceTools(...)` | 工作空间就绪 |
| 技能 | `createSkillTools(...)` | 启用了 skills |
| MCP | 动态注册 `mcp__${serverName}__${toolName}` | MCP 服务器可用 |
| 本地 | `localTools.getTools(assistant.localTools)` | 助理启用 |

### 5.2 工具命名规范

```
mcp__${serverName}__${toolName}  // MCP 工具
search_web                         // 搜索工具
scrape_web                         // 网页抓取
memory_tool                        // 记忆工具
```

### 5.3 工具执行安全

- **工具审批(approval)**：每个工具可标记 `needsApproval`，触发审批流程
- **输出截断**：`maybeTruncateToolOutput()` 截断过长的工具输出（>32KB 截断）
- **执行步骤上限**：`maxSteps = 256` 防止无限循环

---

## 六、多步骤 Tool Call 循环

```
generateText() 中的多步骤循环：

for (stepIndex in 0 until maxSteps) {
  // Step 1: 非流式调用 LLM（传入所有消息 + tools）
  generateInternal(messages, tools, ...)
  
  // Step 2: 检查是否有 tool calls
  val tools = messages.last().getTools().filter { !it.isExecuted }
  if (tools.isEmpty()) break
  
  // Step 3: 处理审批
  // 需要审批 → 置 Pending → break 等待用户
  
  // Step 4: 执行 tool（已批准的）
  toolsToProcess.forEach { tool -> execute(tool) }
  
  // Step 5: 添加工具结果到消息 → 回到 Step 1
  messages += tool results
}
```

---

## 七、缓存与命中率

### 7.1 Claude Prompt Caching（API 级别）

在 `ClaudeProvider.buildMessageRequest()` 中实现：

**策略**：在以下位置插入 `cache_control: { type: "ephemeral" }`

1. **system 的最后 text block**
2. **tools 的最后一条 tool definition**
3. **messages 中的倒数第二条真实 user message**（non-tool_result）

```
system:
  - text: "系统提示词+记忆+工具提示词..."  ← cache_control

tools:
  - name: memory_tool
    ...
  - name: search_web       ← cache_control (最后一个)

messages:
  - user: "第一轮问题"       ← cache_control (倒数第二个真实user)
  - assistant: "第一轮回答"
  - user: "第二轮问题"       ← 无cache_control (最新)
```

这利用了 Claude API 的缓存特性：当请求的相同前缀（system + tools + 历史消息）在缓存中时，跳过计算，返回缓存结果，大幅降低延迟和成本。

**缓存 TTL 可配置**：
- 不设置（默认 ephemeral）
- 30 分钟 (`THIRTY_MINUTES`)
- 1 小时 (`ONE_HOUR`)

### 7.2 LruCache 本地缓存（本地代码级别）

`common/cache/LruCache.kt`：

- **双层结构**：内存 LRU + 文件持久化
- **TTL 过期**：写入时指定过期时间
- **存储后端**：`PerKeyFileCacheStore`（每个 key 一个文件）
- **预加载**：启动时从磁盘预加载到内存
- **驱逐策略**：容量超限时删除最老条目（可选同时删除磁盘文件）

```kotlin
class LruCache<K, V>(
    capacity: Int,              // LRU 容量
    store: CacheStore<K, V>,    // 持久化后端
    expireAfterWriteMillis: Long? = null
)
```

本项目的用途：缓存 API 响应（如模型列表）、高频读取的配置等。

---

## 八、整体数据流（从输入到输出）

```
用户发送消息
    │
    ▼
ChatService.sendMessage()
    │ 添加 USER 消息到对话
    │ 调用 handleMessageComplete()
    ▼
GenerationHandler.generateText()
    │ 创建多步循环（maxSteps=256）
    │ 每一步调用 generateInternal()
    ▼
GenerationHandler.generateInternal()
    │ 1. 拼装 system message（system prompt + memory + tool prompts）
    │ 2. 截断历史消息（contextMessageSize）
    │ 3. 经过 inputTransformers 管道
    │     → TimeReminder → PromptInjection → Placeholder → Template → WorkspaceReminder
    │ 4. 调用 provider.streamText()
    ▼
Provider.sendRequest()
    │ 图Provider 层拼装请求体（含 cache_control）
    ▼
LLM API → 流式返回
    │ 经过 outputTransformers 管道
    │     → ThinkTag → Base64Image → RegexOutput
    │ 更新对话 → UI
    ▼
检查 tool calls
    │ 有 tool → 执行 → 结果加回消息 → 继续下一轮
    │ 无 tool → 结束
    │ 需审批 → 等待用户
```

---

## 九、对接我们项目的准备方案

### 当前香蕉牛奶机的现状

我们的 `use-send-message.ts` 已经实现了基本的发送逻辑，`ContextPreviewPage.tsx` 显示了拼装预览。但目前：

1. **Prompt Injection 系统（世界书）**：尚未接入
2. **Transformer 管道**：未实现，所有逻辑硬编码
3. **供应商级缓存**：未实现（需要等 MCP 连接问题解决）
4. **Tool Call 多步骤循环**：未实现

### 建议对接方案

**方案 A：先做消息拼装层重构（推荐）**

模仿 RikkaHub 的 Transformer 管道模式：
```
Phase 1：定义 MessageTransformer 接口 + 管道执行器
Phase 2：拆分现有逻辑为独立的 Transformer
  ① SystemPromptTransformer（system prompt + memory 拼接）
  ② PromptInjectionTransformer（世界书/Lorebook 注入）
  ③ PlaceholderTransformer（{{time}}等占位符）
Phase 3：ContextPreview 页面适配管道模式
```

**方案 B：直接对接功能盒开关到拼装逻辑**

从简单开始，不做管道抽象，直接在 `use-send-message.ts` 中按开关条件条件组装。
```
if (enableMemory) messages.prepend(memoryPrompt)
if (enableWebSearch) tools.push(searchTool)
if (enableMCP) tools.push(...mcpTools)
```

---

## 十、Tool Call 消息格式正确序列化 — 关键发现

> 对应 2026-07-18 调试过程中发现的 Bug：LLM 连续调用工具时返回 400 Bad Request
> 错误信息：「Invalid assistant message: content or tool calls must be set」
> 用户验证：每次调用工具后让 LLM 发一个消息或思考一下再调用下一个，就能成功——说明问题出在连续多 tool_call 的序列化格式上。

### 10.1 Bug 根因：多 tool_calls 被拆分为多个 assistant 消息

我方代码（`use-send-message.ts` 工具执行循环）的错误写法：

```
// ❌ 错误：为每个工具调用分别创建 assistant 消息
for (const tc of toolCallAcc) {   // toolCallAcc = [call_1, call_2]
  currentMessages.push({
    role: 'assistant',
    content: '',
    toolCalls: [{ id: tc.id, ... }],   // ← 每个 assistant 只带一个 tool_call
  });
  currentMessages.push({
    role: 'tool',
    content: result,
    toolCallId: tc.id,
  });
}
```

发送到 API 的消息序列变成：

```
assistant(content:null, tool_calls=[call_1])     ← assistant × 2！！！
tool(result for call_1)
assistant(content:null, tool_calls=[call_2])     ← 这个 assistant 不是 LLM 生成的！
tool(result for call_2)
```

**违反规则**：OpenAI API 规范要求同一个 LLM 响应的所有 tool_calls 必须在 **一个** assistant 消息中。额外出现的 `assistant(tool_calls=[call_2])` 会让 API 认为客户端在捏造工具调用，返回 400 错误。

### 10.2 正确格式（OpenAI API 规范）

```
// ✅ 正确：所有 tool_calls 合并到一条 assistant 消息
assistant(content:null, tool_calls=[call_1, call_2])    ← 一条消息，全部工具
tool(result for call_1)
tool(result for call_2)
```

### 10.3 RikkaHub 的做法

RikkaHub 的设计从根本上避免了这个问题：

1. **内部格式**：工具调用结果（`output`）存储在 `UIMessagePart.Tool` 中，作为 assistant 消息的 **parts**（不是独立的 tool 消息）。

2. **API 转换层**（`ChatCompletionsAPI.kt` 的 `buildMessages`）负责将内部格式转换为 API 格式：
   - `groupPartsByToolBoundary()` 按工具边界分组
   - 遇到已执行的工具组时：先输出一条 `assistant` 消息（含全部 tool_calls 定义），再输出每个工具的 `tool` 结果消息

3. **代码路线（简化）**：
   ```
   // GenerationHandler 工具执行后——只更新 lastMessage 的 parts
   val lastMessage = messages.last()
   val updatedParts = lastMessage.parts.map { part ->
     if (part is UIMessagePart.Tool) {
       executedTools.find { it.toolCallId == part.toolCallId } ?: part
     } else part
   }
   messages = messages.dropLast(1) + lastMessage.copy(parts = updatedParts)
   // ^^^ 注意：没有创建任何新的 tool 消息！
   
   // Provider 层转换时才会拆分为 assistant + tool 格式
   // 见 ChatCompletionsAPI.kt 的 buildMessages() + groupPartsByToolBoundary()
   ```

### 10.4 与 RikkaHub 的关键架构差异

| 维度 | RikkaHub | 我方 |
|------|----------|------|
| 工具结果存储 | 作为 assistant 消息的部分（`parts`） | 独立 `tool` 角色消息 |
| 消息构造时机 | Provider 层在序列化时自动拆分 | 在 use-send-message 中手动构造 |
| 多工具处理 | 天然正确（同一条 assistant parts 内） | 需要警惕循环拆分问题 |
| 内容字段处理 | `buildAssistantMessageJson` 中 content==""（空字符串） | `toAPIMessages` 中转为 `null` |

### 10.5 对我方代码的修复要点

1. **合并 tool_calls**：在执行工具前，先将 LLM 返回的 **全部** tool_calls 合并到 **一条** assistant 消息，再加到 `currentMessages`
2. **保留原始内容**：`contentAcc`（LLM 助手回复的文本内容）应随 tool_calls 一起保存，不应丢弃
3. **然后逐个添加 tool 结果**：每个工具结果作为独立的 `tool` 消息
4. **注意 content 字段**：当有 tool_calls 时，OpenAI API 期望 `content: null`（我方 `toAPIMessages` 已正确处理）<｜end▁of▁thinking｜>

<｜｜DSML｜｜parameter name="path" string="true">C:\bananamilkphone\项目书与更新日志\LEARN_RikkaHub_LLM_Assembly.md
