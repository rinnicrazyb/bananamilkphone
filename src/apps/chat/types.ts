/** 聊天相关类型定义 */

/** 智能体显示与美化配置 */
export interface AgentDisplayConfig {
  /** 聊天背景 */
  bgImage?: string;
  bgOpacity: number;
  bgBlur: number;

  /** 显示选项 */
  showAvatars: boolean;
  useBubbles: boolean;
  segmentBubbles: boolean;
  bubbleFollowAvatar: boolean;
  showTime: boolean;
  showTokens: boolean;

  /** 自定义气泡样式（data URL） */
  userBubbleImage?: string;
  assistantBubbleImage?: string;

  /** 自定义头像框（data URL） */
  agentAvatarFrame?: string;
  userAvatarFrame?: string;

  /** 用户头像 */
  userAvatar?: string;

  /** 思考强度（预留） */
  thinkingEffort?: number;

  /** 已启用的 MCP 服务器 ID 列表（空数组=不启用MCP） */
  enabledMCPServerIds: string[];
  /** 已启用的搜索供应商名称列表（如 ['tavily']） */
  enabledSearchProviders: string[];

  /** ── 记忆提取配置 ── */
  /** 提取关键词列表 */
  extractionKeywords: string[];
  /** 是否启用关键词触发提取 */
  extractionKeywordEnabled: boolean;
  /** 定时提取时间（HH:mm 格式） */
  extractionTime: string;
  /** 是否启用定时提取 */
  extractionTimeEnabled: boolean;
  /** 是否启用打开软件时触发提取 */
  extractionOpenTriggerEnabled: boolean;
  /** 用户自定义提取提示词（为空则使用默认） */
  extractionPrompt: string;
  /** 上次提取时间戳 */
  lastExtractionTime?: number;
}

export const DEFAULT_DISPLAY_CONFIG: AgentDisplayConfig = {
  bgOpacity: 1,
  bgBlur: 0,
  showAvatars: true,
  useBubbles: true,
  segmentBubbles: true,
  bubbleFollowAvatar: false,
  showTime: true,
  showTokens: false,
  enabledMCPServerIds: [],
  enabledSearchProviders: [],
  extractionKeywords: ['晚安', '记得', '我喜欢', '我讨厌', '最喜欢'],
  extractionKeywordEnabled: false,
  extractionTime: '04:00',
  extractionTimeEnabled: false,
  extractionOpenTriggerEnabled: true,
  extractionPrompt: '',
};

/** 智能体设置（可选，覆盖全局 LLM 配置） */
export interface AgentSettings {
  model?: string;
  ocrModel?: string;
  tts?: string;
  temperature?: number;
  topP?: number;
  systemPrompt: string;
  worldBookIds?: string[];
}

/** 智能体 */
export interface Agent {
  id: string;
  name: string;
  avatar: string;
  lastContactTime?: number;
  unreadCount: number;
  settings: AgentSettings;
  displayConfig?: AgentDisplayConfig;
}

/** 对话 */
export interface Conversation {
  id: string;
  agentId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/** Tool Call（LLM 请求调用工具） */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/** 工具定义（OpenAI function calling 格式） */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** 消息内容部件 — RikkaHub 风格多类型消息 */
export type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'image'; url: string }
  | { type: 'reasoning'; content: string; finishedAt?: number }
  | { type: 'tool_call'; toolCallId: string; toolName: string; input: string; output?: string; isExecuted?: boolean; approvalState?: 'auto' | 'pending' | 'approved' | 'denied' }
  | { type: 'html'; content: string };

/** 消息 */
export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  /** 兼容旧字段：纯文本内容（新代码应使用 parts） */
  content: string;
  /** 旧版：思考链文本（逐步迁移到 parts） */
  reasoning?: string;
  /** 消息部件数组（RikkaHub 风格） */
  parts?: MessagePart[];
  /** 旧版：assistant 消息中的工具调用（逐步迁移到 parts） */
  toolCalls?: ToolCall[];
  /** tool 角色消息关联的 tool_call_id */
  toolCallId?: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'read' | 'failed';
  /** 是否已被记忆提取 */
  memoryExtracted?: boolean;
  tokenCount?: {
    prompt: number;
    completion: number;
    cached: number;
  };
}

/** 记忆条目 */
export interface Memory {
  id: string;
  agentId: string;
  content: string;
  sourceMsgIds: string[];
  createdAt: number;
  updatedAt: number;
  /** 手动编辑过就不再被自动覆盖 */
  manualEdited?: boolean;
}
