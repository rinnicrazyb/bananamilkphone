/**
 * Transformer 管道 — 类型定义
 *
 * 每个 Transformer 是一个纯函数：接收 LLMMessage[]，返回 LLMMessage[]。
 * 管道将多个 Transformer 串联执行，上一个的输出是下一个的输入。
 */
import type { LLMMessage } from '../llm/types';
import type { Agent, AgentDisplayConfig, Memory } from '../../apps/chat/types';
import type { MCPServer, SearchProviderConfig } from '../../apps/settings/types';
import type { Lorebook } from '../../apps/lorebook/types';

/** Transformer 执行上下文（每个请求构建一次，传递给管道中所有 Transformer） */
export interface TransformerContext {
  /** 当前智能体 */
  agent: Agent | undefined;
  /** 该智能体的记忆列表 */
  memories: Memory[];
  /** 显示/功能配置 */
  displayConfig: AgentDisplayConfig | undefined;
  /** 所有 MCP 服务器列表 */
  mcpServers: MCPServer[];
  /** 所有搜索供应商配置 */
  searchProviders: Record<string, SearchProviderConfig>;
  /** 当前智能体绑定的世界书列表（已包含完整 entries） */
  lorebooks: Lorebook[];
  /** 世界书注入：对话级别的注入 ID（后续扩展） */
  conversationModeInjectionIds?: string[];
  /** 世界书注入：对话级别的 Lorebook ID（后续扩展） */
  conversationLorebookIds?: string[];
  /** 自定义占位符键值对（后续扩展） */
  placeholders?: Record<string, string>;
}

/** 一个 Transformer = 接收 messages[]，返回 messages[] */
export type MessageTransformer = (
  messages: LLMMessage[],
  ctx: TransformerContext
) => LLMMessage[];
