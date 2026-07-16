/**
 * SystemPromptTransformer
 *
 * 将 system prompt 合并为一条 system message 放在最开头。
 * 注意：记忆（memory）不再由本 transformer 处理，而是由
 * memoryInjectionTransformer 在 promptInjectionTransformer 之后执行，
 * 确保拼装顺序为：system prompt → 世界书注入 → 记忆注入 → 对话历史
 */
import type { LLMMessage } from '../llm/types';
import type { MessageTransformer, TransformerContext } from './types';

export const systemPromptTransformer: MessageTransformer = (
  messages: LLMMessage[],
  ctx: TransformerContext
): LLMMessage[] => {
  if (!ctx.agent?.settings.systemPrompt) {
    return messages;
  }

  const systemMessage: LLMMessage = {
    role: 'system',
    content: ctx.agent.settings.systemPrompt,
  };

  // 移除原有 system message，再把新的放在开头
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');
  return [systemMessage, ...nonSystemMessages];
};
