/** LLM 配置类型 */

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  topP: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

/** 工具定义（OpenAI function calling 格式，给 LLM API 用） */
export interface LLMToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** assistant 消息中携带的工具调用 */
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  /** tool 角色的消息关联的 tool_call_id */
  toolCallId?: string;
}

/** 流式块中的工具调用增量（OpenAI 分 index 推送） */
export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

export interface StreamChunk {
  content?: string;
  reasoning?: string;
  /** 工具调用增量（按 index 累积） */
  toolCallDeltas?: ToolCallDelta[];
  /** 本轮 finish_reason */
  finishReason?: 'stop' | 'tool_calls' | 'length' | null;
  done: boolean;
  /** API 返回的 token 用量（通常在最后一个 chunk 中） */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    /** 缓存命中的 token 数（DeepSeek/Claude 支持） */
    cachedTokens?: number;
  };
}
