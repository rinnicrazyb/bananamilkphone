# 长期记忆功能 — 任务规格

> 基于 LumiMuse 架构 + grill-me 访谈确认

---

## 一、功能概述

在聊天 APP 功能盒的"记忆"页面中实现完整的记忆管理系统：
- 手动提取：用户选择对话消息 → LLM 总结 → 保存
- 自动提取：关键词触发 + 定时触发 + 打开软件触发
- 提取提示词用户自定义
- 记忆列表（编号 + 可折叠 + 编辑/删除）

---

## 二、数据模型变更

### 2.1 Memory 类型扩展（src/apps/chat/types.ts）

```typescript
export interface Memory {
  id: string;
  agentId: string;
  content: string;
  /** 来源消息 ID 列表 */
  sourceMsgIds: string[];
  createdAt: number;
  updatedAt: number;
  /** 手动编辑过就不再被自动覆盖 */
  manualEdited?: boolean;
}
```

### 2.2 Message 类型增加提取标记

```typescript
export interface Message {
  // ... 现有字段
  /** 是否已被记忆提取 */
  memoryExtracted?: boolean;
}
```

### 2.3 AgentDisplayConfig 增加提取配置

```typescript
export interface AgentDisplayConfig {
  // ... 现有字段
  
  /** 提取关键词列表 */
  extractionKeywords: string[];
  /** 是否启用关键词触发 */
  extractionKeywordEnabled: boolean;
  /** 定时提取时间（HH:mm 格式，如 "04:00"） */
  extractionTime: string;
  /** 是否启用定时提取 */
  extractionTimeEnabled: boolean;
  /** 是否启用打开软件时触发 */
  extractionOpenTriggerEnabled: boolean;
  /** 用户自定义提取提示词（为空则使用默认） */
  extractionPrompt: string;
}
```

### 2.4 DEFAULT_DISPLAY_CONFIG 更新

```typescript
export const DEFAULT_DISPLAY_CONFIG: AgentDisplayConfig = {
  // ... 现有字段
  extractionKeywords: ['晚安', '记得', '我喜欢', '我讨厌', '最喜欢'],
  extractionKeywordEnabled: false,
  extractionTime: '04:00',
  extractionTimeEnabled: false,
  extractionOpenTriggerEnabled: true,
  extractionPrompt: '',
};
```

---

## 三、UI 设计（MemoryPage 完整布局）

```
┌─────────────────────────────────────────┐
│ ← 返回              长期记忆            │
├─────────────────────────────────────────┤
│                                         │
│  ┌─ 提取操作 ────────────────────────┐  │
│  │  [📥 从对话中提取记忆]            │  │
│  │  已提取 N 条 · 未提取 M 条        │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌─ 自动提取 ────────────────────────┐  │
│  │  ● 关键词触发          [开关]     │  │
│  │    关键词：晚安 记得 我喜欢 ...   │  │
│  │            [编辑关键词]           │  │
│  │                                    │  │
│  │  ● 定时提取            [开关]     │  │
│  │    时间：[04:00]                  │  │
│  │                                    │  │
│  │  ● 打开软件时触发      [开关]     │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌─ 提取提示词 ──────────────────────┐  │
│  │  <textarea> 用户可编辑的提示词    │  │
│  │  [恢复默认提示词]                 │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌─ 记忆列表 ────────────────────────┐  │
│  │  #1 记忆内容摘要...      [▼][✎][🗑]│  │
│  │  #2 记忆内容摘要...      [▼][✎][🗑]│  │
│  │  #3 记忆内容摘要...      [▼][✎][🗑]│  │
│  │  ...                               │  │
│  └────────────────────────────────────┘  │
├─────────────────────────────────────────┤
│        [确认]          [取消]            │
└─────────────────────────────────────────┘
```

### 提取弹窗（Modal）

```
┌──────────────────────────────────────────┐
│  从对话中提取记忆                         │
│  选择需要提取为记忆的消息条目              │
│  [☐ 全选]                                │
│  ────────────────────────────────────     │
│  ☑ 用户 (03/30 02:01): 晚安玛卡巴卡~     │
│  ☑ AI: 晚安宝宝，做个好梦                 │
│  ☐ 用户 (03/29 23:15): 今天好累          │  ← 已提取，灰色不可选
│  ☑ 用户 (03/29 22:00): 我喜欢吃草莓      │
│  ────────────────────────────────────     │
│  [提取并总结]  [取消]                     │
└──────────────────────────────────────────┘
```

---

## 四、提取流程（核心逻辑）

### 4.1 手动提取流程

```
用户点击"从对话中提取"
  → 弹窗列出所有消息（已提取的灰色不可选）
  → 用户勾选/全选 → 点击"提取并总结"
  → 格式化选中消息（时间戳+说话人）
  → 调用 LLM（使用 extractionPrompt）
  → 解析 JSON 响应
  → 保存到 chat-store（标记被提取消息为已提取）
  → 关闭弹窗 → 刷新记忆列表
```

### 4.2 发送给 LLM 的消息格式

类似 LumiMuse：
```
用户 (2026/03/30 02:01): 晚安玛卡巴卡~
AI (2026/03/30 02:01): 晚安宝宝，做个好梦~
用户 (2026/03/29 22:00): 我喜欢吃草莓
```

### 4.3 默认提取提示词（基于伴侣场景改编）

提供一套完整的伴侣 AI 场景提取 prompt，包含：
- 时间处理规则
- 代词替换（"AI/你" → "我"）
- 合并规则
- 输出 JSON schema
- 禁止提取无信息闲聊

### 4.4 LLM 返回格式

```json
{
  "memories": [
    {
      "content": "2026年3月30日凌晨，用户对我说晚安时叫我玛卡巴卡，我回应晚安并哄睡。",
      "sourceMsgIds": ["msg-1", "msg-2"]
    }
  ]
}
```

简化版——没有 LumiMuse 的分类/标签/重要性，只保留 content + sourceMsgIds。

### 4.5 合并逻辑（简化版）

- 检查新内容与已有记忆的文本相似度
- 相似度 > 0.7 则合并（取更长的内容）
- 相似度 <= 0.7 则新增一条

---

## 五、自动触发实现

### 5.1 关键词触发

在 `use-send-message.ts` 中，AI 回复完成后：

```typescript
// 在 tool call 循环结束后，消息已完整接收后：
const msgContent = userContent;
const keywords = agent?.displayConfig?.extractionKeywords ?? [];
const hasTrigger = keywords.some(kw => msgContent.includes(kw));
if (hasTrigger && agent?.displayConfig?.extractionKeywordEnabled) {
  await triggerExtraction(agentId, conversationId);
}
```

### 5.2 定时触发 + 打开触发

在 App 层级（main.tsx 或 LauncherPage）中：

```typescript
// 打开软件时检查所有智能体
function checkPendingExtractions() {
  const agents = useChatStore.getState().agents;
  for (const agent of agents) {
    const config = agent.displayConfig;
    if (!config) continue;
    
    // 打开触发
    if (config.extractionOpenTriggerEnabled) {
      triggerExtraction(agent.id, /* latest conversation */);
    }
    
    // 定时触发
    if (config.extractionTimeEnabled && config.extractionTime) {
      const now = new Date();
      const [h, m] = config.extractionTime.split(':').map(Number);
      const lastExtract = getLastExtractionTime(agent.id);
      // 如果已过设定时间且今天还没提取过
      if (now.getHours() >= h && now.getMinutes() >= m && !lastExtract || lastExtract < todayStart) {
        triggerExtraction(agent.id, /* latest conversation */);
      }
    }
  }
}
```

### 5.3 提取函数签名

```typescript
async function triggerExtraction(
  agentId: string, 
  conversationId: string,
  customPrompt?: string
): Promise<void>
```

---

## 六、文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/apps/chat/types.ts` | **修改** | Memory 加 sourceMsgIds；Message 加 memoryExtracted；AgentDisplayConfig 加提取配置 |
| `src/apps/chat/store/chat-store.ts` | **修改** | 新增提取相关 actions（addMemories, markMessagesExtracted） |
| `src/services/memory-extraction/types.ts` | **新建** | 提取相关类型 |
| `src/services/memory-extraction/prompt.ts` | **新建** | 默认提取提示词 |
| `src/services/memory-extraction/index.ts` | **新建** | 核心提取逻辑（格式化→LLM→解析→保存） |
| `src/apps/chat/pages/MemoryPage.tsx` | **重写** | 完整 UI：提取按钮/弹窗/设置区/提示词编辑/记忆列表 |
| `src/hooks/use-send-message.ts` | **修改** | AI 回复完成后检查关键词触发提取 |
| `src/App.tsx` 或 `src/main.tsx` | **修改** | 打开软件时触发检查 |

---

## 七、依赖关系

```
Step 1 (数据模型)
  ├── Step 2 (提取引擎) ← 依赖 Step 1
  │     └── Step 3 (MemoryPage UI) ← 依赖 Step 1+2
  ├── Step 4 (关键词触发) ← 依赖 Step 2
  └── Step 5 (定时/打开触发) ← 依赖 Step 2
```

推荐顺序：**1 → 2 → 3 → (4+5 并行)**
