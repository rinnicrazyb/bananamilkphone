/**
 * PromptInjectionTransformer — 世界书/Lorebook 注入
 *
 * 完全参照 RikkaHub 的 PromptInjectionTransformer 实现：
 * 1. collectInjections() — 收集需要注入的内容（关键词匹配 + 常驻激活）
 * 2. applyInjections() — 按位置+优先级注入到消息列表
 * 3. findSafeInsertIndex() — 避免插入到 USER→ASSISTANT(tool) 之间
 *
 * 注入位置（5种）：
 *   BEFORE_SYSTEM_PROMPT — 系统提示词之前（合并到 system message 开头）
 *   AFTER_SYSTEM_PROMPT  — 系统提示词之后（合并到 system message 末尾）
 *   TOP_OF_CHAT          — 顶部：在第一条用户消息前插入独立消息
 *   BOTTOM_OF_CHAT       — 底部：在最后一条消息前插入独立消息
 *   AT_DEPTH             — 指定深度：从最新消息往前 N 条的位置插入
 */
import type { LLMMessage } from '../llm/types';
import type { MessageTransformer, TransformerContext } from './types';
import type { LorebookEntry, InjectionPosition } from '../../apps/lorebook/types';

// ─── 类型辅助 ─────────────────────────────────────────

/** 收集到的单条注入（展开后的 LorebookEntry + 来源信息） */
interface CollectedInjection {
  id: string;
  content: string;
  position: InjectionPosition;
  priority: number;
  injectDepth: number;
  role: 'user' | 'assistant';
  /** 来源世界书名称（用于调试/预览） */
  sourceBook: string;
  /** 来源条目名称 */
  sourceEntry: string;
}

// ─── 主 Transformer ──────────────────────────────────

export const promptInjectionTransformer: MessageTransformer = (
  messages: LLMMessage[],
  ctx: TransformerContext
): LLMMessage[] => {
  const injections = collectInjections(messages, ctx);
  if (injections.length === 0) return messages;

  const byPosition = groupByPosition(injections);
  return applyInjections(messages, byPosition);
};

// ─── B1: collectInjections ──────────────────────────

/**
 * 收集需要注入的内容
 *
 * 1. 从 ctx.lorebooks 中筛选出当前智能体绑定的世界书
 * 2. 对每个启用世界书中的启用条目：
 *    - constantActive=true → 直接加入注入列表
 *    - 否则：提取最近 scanDepth 条非 SYSTEM 消息作为上下文 → 关键词匹配
 * 3. 返回按 priority 降序排列的注入列表
 */
export function collectInjections(
  messages: LLMMessage[],
  ctx: TransformerContext
): CollectedInjection[] {
  const agent = ctx.agent;
  if (!agent) return [];

  // 获取智能体绑定的世界书 ID 列表
  const boundIds = agent.settings?.worldBookIds ?? [];
  if (boundIds.length === 0) return [];

  // 筛选绑定的世界书
  const boundLorebooks = ctx.lorebooks.filter(
    (b) => b.enabled && boundIds.includes(b.id)
  );
  if (boundLorebooks.length === 0) return [];

  const result: CollectedInjection[] = [];

  // 提取非 SYSTEM 消息上下文（用于关键词匹配）
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  for (const book of boundLorebooks) {
    for (const entry of book.entries) {
      if (!entry.enabled) continue;

      // 常驻激活 → 无条件注入
      if (entry.constantActive) {
        result.push(toCollected(entry, book.name));
        continue;
      }

      // 关键词激活 → 需要匹配
      if (entry.keywords.length === 0) continue;

      const context = extractContext(nonSystemMessages, entry.scanDepth);
      if (isTriggered(entry, context)) {
        result.push(toCollected(entry, book.name));
      }
    }
  }

  // 按优先级降序排列（同优先级保持原顺序）
  return result.sort((a, b) => b.priority - a.priority);
}

/** 将 LorebookEntry 转换为 CollectedInjection */
function toCollected(entry: LorebookEntry, bookName: string): CollectedInjection {
  return {
    id: entry.id,
    content: entry.content,
    position: entry.position,
    priority: entry.priority,
    injectDepth: entry.injectDepth,
    role: entry.role,
    sourceBook: bookName,
    sourceEntry: entry.name,
  };
}

/**
 * 从消息列表中提取用于匹配的上下文文本
 * @param messages 消息列表（已过滤 SYSTEM）
 * @param scanDepth 取最近 N 条
 */
function extractContext(messages: LLMMessage[], scanDepth: number): string {
  return messages
    .slice(-scanDepth)
    .map((m) => m.content)
    .join('\n');
}

/**
 * 判断条目是否被关键词/正则触发
 */
export function isTriggered(entry: LorebookEntry, context: string): boolean {
  if (!entry.enabled) return false;
  if (entry.constantActive) return true;
  if (entry.keywords.length === 0) return false;

  return entry.keywords.some((keyword) => {
    try {
      if (entry.useRegex) {
        const flags = entry.caseSensitive ? '' : 'i';
        return new RegExp(keyword, flags).test(context);
      }
      return entry.caseSensitive
        ? context.includes(keyword)
        : context.toLowerCase().includes(keyword.toLowerCase());
    } catch {
      return false; // 正则无效时静默跳过
    }
  });
}

// ─── 分组 ────────────────────────────────────────────

/** 按 position 分组，组内按 priority 降序 */
function groupByPosition(
  injections: CollectedInjection[]
): Record<string, CollectedInjection[]> {
  const groups: Record<string, CollectedInjection[]> = {};
  for (const inj of injections) {
    if (!groups[inj.position]) groups[inj.position] = [];
    groups[inj.position].push(inj);
  }
  // 组内按 priority 降序（同优先级保持添加顺序）
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => b.priority - a.priority);
  }
  return groups;
}

// ─── B2: applyInjections ────────────────────────────

/**
 * 按位置分组应用注入到消息列表
 */
export function applyInjections(
  messages: LLMMessage[],
  byPosition: Record<string, CollectedInjection[]>
): LLMMessage[] {
  const result = messages.map((m) => ({ ...m })); // 浅拷贝

  // ── 修改系统提示词（BEFORE / AFTER） ──
  const beforeContent = mergeContent(byPosition['BEFORE_SYSTEM_PROMPT']);
  const afterContent = mergeContent(byPosition['AFTER_SYSTEM_PROMPT']);

  if (beforeContent || afterContent) {
    const systemIndex = result.findIndex((m) => m.role === 'system');
    if (systemIndex >= 0) {
      const original = result[systemIndex].content;
      result[systemIndex] = {
        ...result[systemIndex],
        content: [beforeContent, original, afterContent]
          .filter(Boolean)
          .join('\n'),
      };
    } else {
      // 没有 system 消息 → 创建一个
      result.unshift({
        role: 'system',
        content: [beforeContent, afterContent].filter(Boolean).join('\n'),
      });
    }
  }

  // ── 插入独立消息（TOP / BOTTOM / AT_DEPTH） ──
  const topInjections = byPosition['TOP_OF_CHAT'];
  if (topInjections?.length) {
    const topMsgs = createInjectionMessages(topInjections);
    let insertAt = result.findIndex((m) => m.role === 'user');
    if (insertAt < 0) insertAt = result.length;
    insertAt = findSafeInsertIndex(result, insertAt);
    result.splice(insertAt, 0, ...topMsgs);
  }

  const bottomInjections = byPosition['BOTTOM_OF_CHAT'];
  if (bottomInjections?.length) {
    const bottomMsgs = createInjectionMessages(bottomInjections);
    let insertAt = Math.max(result.length - 1, 0);
    insertAt = findSafeInsertIndex(result, insertAt);
    result.splice(insertAt, 0, ...bottomMsgs);
  }

  const atDepthInjections = byPosition['AT_DEPTH'];
  if (atDepthInjections?.length) {
    // 按 depth 分组，从大到小处理（避免索引偏移）
    const byDepth: Record<number, CollectedInjection[]> = {};
    for (const inj of atDepthInjections) {
      const d = Math.max(inj.injectDepth, 1);
      if (!byDepth[d]) byDepth[d] = [];
      byDepth[d].push(inj);
    }
    Object.keys(byDepth)
      .map(Number)
      .sort((a, b) => b - a)
      .forEach((depth) => {
        const msgs = createInjectionMessages(byDepth[depth]);
        let insertAt = Math.max(result.length - depth, 0);
        insertAt = findSafeInsertIndex(result, insertAt);
        result.splice(insertAt, 0, ...msgs);
      });
  }

  return result;
}

/** 将同一位置的注入内容合并为一段文本 */
function mergeContent(injections: CollectedInjection[] | undefined): string {
  if (!injections?.length) return '';
  return injections.map((i) => i.content).join('\n');
}

/**
 * 将注入列表转换为要插入的消息列表
 * 按 role 分组，同一 role 的注入合并为一条消息
 */
function createInjectionMessages(
  injections: CollectedInjection[]
): LLMMessage[] {
  const byRole: Record<string, string[]> = {};
  for (const inj of injections) {
    const role = inj.role;
    if (!byRole[role]) byRole[role] = [];
    byRole[role].push(inj.content);
  }
  return Object.entries(byRole).map(([role, contents]) => ({
    role: role as 'user' | 'assistant',
    content: contents.join('\n'),
  }));
}

// ─── B3: findSafeInsertIndex ─────────────────────────

/**
 * 查找安全的插入位置，避免注入到 USER → ASSISTANT(含 Tool) 之间
 *
 * 某些供应商（如 DeepSeek）要求 USER 后紧跟带工具的 ASSISTANT，
 * 在两者之间插入消息会导致报错或破坏推理连续性。
 */
export function findSafeInsertIndex(
  messages: LLMMessage[],
  targetIndex: number
): number {
  let index = Math.max(0, Math.min(targetIndex, messages.length));

  while (index > 0) {
    const prev = messages[index - 1];
    const curr = messages[index];

    const isPrevUser = prev?.role === 'user';
    const isCurrentAssistantWithTools =
      curr?.role === 'assistant' &&
      Array.isArray(curr.toolCalls) &&
      curr.toolCalls.length > 0;

    if (isPrevUser && isCurrentAssistantWithTools) {
      index--;
    } else {
      break;
    }
  }

  return index;
}
