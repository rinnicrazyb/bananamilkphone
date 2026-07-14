/** 聊天相关类型定义 */

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
}

/** 对话 */
export interface Conversation {
  id: string;
  agentId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/** 消息 */
export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'read' | 'failed';
  tokenCount?: {
    prompt: number;
    completion: number;
    cached: number;
  };
}
