/** 聊天相关类型定义 */

/** 智能体 */
export interface Agent {
  id: string;
  name: string;
  avatar: string;
  lastContactTime?: number;
  unreadCount: number;
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
