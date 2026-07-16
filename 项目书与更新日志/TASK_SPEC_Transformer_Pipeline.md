# Transformer 管道重构 — 任务规格

> 基于 RikkaHub 架构学习，结合香蕉牛奶机现状设计

---

## 一、目标

把 `use-send-message.ts` 中硬编码的消息拼装逻辑拆成独立的 Transformer 管道，让 ContextPreview 和真实发送走**同一个管道**，后续加世界书/占位符/OCR 等只需新增一个 Transformer。

**原则**：纯重构，不改行为 — 重构前后发送给 LLM 的消息结构完全一致。

---

## 二、架构设计

### 2.1 类型定义

```typescript
// src/services/transformer-pipeline/types.ts

interface TransformerContext {
  agent: Agent | undefined;
  memories: Memory[];
  displayConfig: AgentDisplayConfig | undefined;
  mcpServers: MCPServer[];
  searchProviders: SearchProviderConfig[];
  /** 后续扩展：世界书注入 */
  conversationModeInjectionIds?: string[];
  conversationLorebookIds?: string[];
  /** 后续扩展：占位符替换数据 */
  placeholders?: Record<string, string>;
}

/** 一个 Transformer = 接收 messages[], 返回 messages[] */
type MessageTransformer = (
  messages: LLMMessage[],
  ctx: TransformerContext
) => LLMMessage[];
```

### 2.2 管道顺序

```
1. SystemPromptTransformer
   合并 system prompt + memory + tool system prompt 为一条 system message

2. PromptInjectionTransformer（占位）
   5个注入位置定义好，返回原 messages（什么都不做）

3. PlaceholderTransformer
   替换 {{time}}, {{date}} 等占位符（目前只留接口）
```

### 2.3 调用方式

```typescript
// runPipeline = 把所有 transformer 串联执行
const llmMessages = runPipeline(pipeline, baseMessages, ctx);
```

---

## 三、文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/transformer-pipeline/types.ts` | **新建** | TransformerContext + MessageTransformer |
| `src/services/transformer-pipeline/system-prompt.ts` | **新建** | 合并 system prompt + memory + tool prompt 为一条 system |
| `src/services/transformer-pipeline/prompt-injection.ts` | **新建** | 世界书注入占位（5位置, 空实现） |
| `src/services/transformer-pipeline/placeholder.ts` | **新建** | 占位符替换（空实现，只定义接口） |
| `src/services/transformer-pipeline/index.ts` | **新建** | 导出 pipeline[] + runPipeline() |
| `src/hooks/use-send-message.ts` | **修改** | 替换硬编码拼装为 pipeline 调用 |
| `src/apps/chat/pages/ContextPreviewPage.tsx` | **修改** | 复用 pipeline，删除手写拼装逻辑 |
| `src/services/llm/types.ts` | **修改** | 补充 LLMMessage 类型（如果需要） |

### 新增文件：5 个
### 修改文件：3 个

---

## 四、开发步骤（Step by Step）

### Step 1 — 新建类型定义 + SystemPromptTransformer

- `types.ts`：TransformerContext, MessageTransformer
- `system-prompt.ts`：
  - 把 system prompt + memory 文本 + tool system prompt 合并为一条 system message
  - 空记忆/空工具时不生成对应内容
- 纯函数，不依赖外部状态

### Step 2 — 新建注入占位 + 占位符

- `prompt-injection.ts`：
  - 枚举 5 个注入位置
  - transform 函数直接返回原 messages
  - 写好详细的注释说明后续如何接入世界书
- `placeholder.ts`：
  - transform 函数返回原 messages（预留）

### Step 3 — 新建 index.ts（管道执行器）

- 导出 `pipeline: MessageTransformer[]`
- 导出 `runPipeline(messages, ctx): LLMMessage[]`
- `reduce` 实现串联

### Step 4 — 重构 use-send-message.ts

- 移除行 214-236 的硬编码拼装逻辑
- 替换为 `const llmMessages = runPipeline(pipeline, baseMessages, ctx)`
- 构造 TransformerContext（从 store 中读取数据）
- 其他逻辑（streamChat、tool call 循环、abort）保持不变

### Step 5 — 重构 ContextPreviewPage.tsx

- 复用 `runPipeline(pipeline, messages, ctx)`
- 用执行结果渲染各区块
- 删除现有的手写 `systemBlock/memoryBlock/toolDefs` 逻辑
- 保持 UI 展示方式不变

### Step 6 — 回归测试

- `npm run build` 确认编译通过
- 浏览器验证：发送一条消息，对比重构前后的消息内容
- 打开 ContextPreview 对比区块展示
- 验证工具调用循环功能正常

---

## 五、测试策略

| 检测点 | 方法 |
|--------|------|
| 编译通过 | `npm run build` |
| 消息发送 | 发送一条文本消息，确认 AI 回复正常 |
| 记忆注入 | 添加一条记忆后发送，确认 system message 包含记忆 |
| 搜索工具 | 启用搜索，看到 tools 中有 search_web |
| ContextPreview | 各区块展示与改造前一致 |
| 工具调用循环 | 搜索/MCP 工具调用仍正常工作 |
| 记忆总结 | 这一轮不做，不影响 |

---

## 六、不做的事情（明确排除）

- ❌ 不改聊天 UI 组件（ChatView/ChatInput/AgentList 等）
- ❌ 不改 chat-store（类型和 store 不变）
- ❌ 不改 MCPPage/WebSearchPage（它们的功能不变）
- ❌ 不改 MemoryPage（记忆总结功能延后）
- ❌ 不做主动消息功能
- ❌ 不做真正的世界书注入（只占位）
- ❌ 不做 cache_control（依赖供应商支持，后续再说）
