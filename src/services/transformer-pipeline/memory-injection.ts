/**
 * MemoryInjectionTransformer
 *
 * 将长期记忆注入到 system message 末尾。
 *
 * 在管道中位于 promptInjectionTransformer 之后执行，确保拼装顺序：
 *   system prompt → 世界书注入 → 记忆注入 → 对话历史
 *
 * 行为：
 * - 找到现有的 system message
 * - 在末尾追加记忆文本（包含模板）
 * - 如果没有任何记忆，不做任何修改
 */
import type { LLMMessage } from '../llm/types';
import type { MessageTransformer, TransformerContext } from './types';

/** 记忆拼接模板 */
const MEMORY_TEMPLATE = `以下是关于用户和对话的相关记忆：
{memoryContent}
请在回答中参考以上记忆。`;

function formatMemories(memories: TransformerContext['memories']): string {
  if (memories.length === 0) return '';
  return memories.map((m) => `- ${m.content}`).join('\n');
}

export const memoryInjectionTransformer: MessageTransformer = (
  messages: LLMMessage[],
  ctx: TransformerContext
): LLMMessage[] => {
  const memoryText = formatMemories(ctx.memories);
  if (!memoryText) return messages;

  const sysIdx = messages.findIndex((m) => m.role === 'system');
  if (sysIdx === -1) {
    // 没有 system message，创建一个
    return [
      { role: 'system', content: MEMORY_TEMPLATE.replace('{memoryContent}', memoryText) },
      ...messages,
    ];
  }

  const updated = messages.map((m, i) =>
    i === sysIdx
      ? { ...m, content: m.content + '\n\n' + MEMORY_TEMPLATE.replace('{memoryContent}', memoryText) }
      : m
  );
  return updated;
};
