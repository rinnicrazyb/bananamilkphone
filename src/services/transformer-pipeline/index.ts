/**
 * Transformer 管道 — 入口
 *
 * 把多个 Transformer 串联成管道，提供 runPipeline 函数。
 *
 * 使用方式：
 *   const llmMessages = runPipeline(baseMessages, ctx);
 *
 * 在 ContextPreview 中也能使用相同的 pipeline 来预览：
 *   const previewMessages = runPipeline(historyMessages, ctx);
 */
import type { LLMMessage } from '../llm/types';
import { systemPromptTransformer } from './system-prompt';
import { promptInjectionTransformer } from './prompt-injection';
import { memoryInjectionTransformer } from './memory-injection';
import { placeholderTransformer } from './placeholder';
import type { MessageTransformer, TransformerContext } from './types';

/**
 * 默认管道（顺序敏感）
 *
 * 1. systemPromptTransformer     — 合并 system prompt 为一条 system message
 * 2. promptInjectionTransformer  — 世界书注入（BEFORE/AFTER 绕 system message）
 * 3. memoryInjectionTransformer  — 长期记忆注入（在世界书注入之后，追加到 system message 末尾）
 * 4. placeholderTransformer      — 占位符替换
 *
 * 拼装结果示例：
 *   [系统提示词]
 *       ↓ 世界书 BEFORE
 *       ↓ 世界书 AFTER
 *       ↓ 记忆注入
 *   → 最终 system message 内容：
 *     [WB BEFORE]
 *     [系统提示词]
 *     [WB AFTER]
 *     [记忆模板 + 内容]
 */
export const defaultPipeline: MessageTransformer[] = [
  systemPromptTransformer,
  promptInjectionTransformer,
  memoryInjectionTransformer,
  placeholderTransformer,
];

/**
 * 串联执行管道中的全部 Transformer
 *
 * @param pipeline  - Transformer 数组（默认使用 defaultPipeline）
 * @param messages  - 原始消息列表（历史消息 + 最新输入）
 * @param ctx       - 执行上下文（agent / memories / 配置等）
 * @returns         经过所有 Transformer 处理后的消息列表
 */
export function runPipeline(
  messages: LLMMessage[],
  ctx: TransformerContext,
  pipeline: MessageTransformer[] = defaultPipeline
): LLMMessage[] {
  return pipeline.reduce((acc, transformer) => transformer(acc, ctx), messages);
}

// 重新导出类型方便外部使用
export type { TransformerContext, MessageTransformer } from './types';
