/**
 * 记忆提取 — 核心引擎
 *
 * 功能：
 * 1. 格式化选中消息（时间戳+说话人）
 * 2. 调用 LLM 提取记忆
 * 3. 解析 JSON 响应
 * 4. 合并到已有记忆
 */
import { chatCompletion } from '../llm/index';
import { useChatStore } from '../../apps/chat/store/chat-store';
import { useSettingsStore } from '../../store/settings-store';
import { DEFAULT_EXTRACTION_PROMPT } from './prompt';
import type { LLMMessage } from '../llm/types';
import type { ExtractionResponse } from './types';
import type { Message, Memory } from '../../apps/chat/types';

function formatMessageForExtraction(msg: Message, agentName: string): string {
  const d = new Date(msg.timestamp);
  const ts = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const speaker = msg.role === 'user' ? '用户' : agentName;
  return `${speaker} (${ts}): ${msg.content}`;
}

function contentSimilarity(a: string, b: string): number {
  const left = a.replace(/\s+/g, '').toLowerCase();
  const right = b.replace(/\s+/g, '').toLowerCase();
  if (!left || !right) return 0;

  const bigramsA = new Set<string>();
  const bigramsB = new Set<string>();
  for (let i = 0; i < left.length - 1; i++) bigramsA.add(left[i] + left[i + 1]);
  for (let i = 0; i < right.length - 1; i++) bigramsB.add(right[i] + right[i + 1]);

  const intersection = [...bigramsA].filter((x) => bigramsB.has(x)).length;
  const union = new Set([...bigramsA, ...bigramsB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 合并新提取的记忆到已有记忆列表
 * 相似度 > 0.7 则合并（保留更长内容），否则新增
 */
function mergeMemories(
  existing: Memory[],
  newMemories: { content: string; sourceMsgIds: string[] }[],
  agentId: string
): Memory[] {
  const result = [...existing];
  const now = Date.now();

  for (const newEntry of newMemories) {
    let merged = false;

    for (let i = 0; i < result.length; i++) {
      if (result[i].manualEdited) continue; // 手动编辑过的不覆盖

      const sim = contentSimilarity(result[i].content, newEntry.content);
      if (sim > 0.7) {
        // 合并：保留更长内容，合并来源
        const existingEntry = result[i];
        const betterContent =
          newEntry.content.length > existingEntry.content.length
            ? newEntry.content
            : existingEntry.content;
        result[i] = {
          ...existingEntry,
          content: betterContent,
          sourceMsgIds: [...new Set([...existingEntry.sourceMsgIds, ...newEntry.sourceMsgIds])],
          updatedAt: now,
        };
        merged = true;
        break;
      }
    }

    if (!merged) {
      result.push({
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        agentId,
        content: newEntry.content,
        sourceMsgIds: newEntry.sourceMsgIds,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return result;
}

export interface ExtractOptions {
  /** 要提取的消息列表 */
  messages: Message[];
  /** 智能体名称 */
  agentName: string;
  /** 智能体 ID */
  agentId: string;
  /** 对话 ID */
  conversationId: string;
  /** 自定义提示词（为空则使用默认） */
  customPrompt?: string;
}

export interface ExtractResult {
  success: boolean;
  count: number;
  error?: string;
}

/**
 * 执行记忆提取
 *
 * 1. 格式化消息 → 2. 调用 LLM → 3. 解析 JSON → 4. 合并到 store
 */
export async function extractMemories(options: ExtractOptions): Promise<ExtractResult> {
  const { messages, agentName, agentId, conversationId, customPrompt } = options;
  const llmConfig = useSettingsStore.getState().llmConfig;

  if (!llmConfig.baseUrl || !llmConfig.apiKey || !llmConfig.model) {
    return { success: false, count: 0, error: '未配置 LLM API' };
  }

  if (messages.length === 0) {
    return { success: false, count: 0, error: '没有选择消息' };
  }

  // 1. 格式化消息
  const conversationText = messages
    .map((m) => formatMessageForExtraction(m, agentName))
    .join('\n');

  // 2. 构建提取 prompt（替换 {existing_memories} 和 {conversation_text}）
  const storeState = useChatStore.getState();
  const existingStoreMemories = storeState.memories[agentId] || [];
  const existingText = existingStoreMemories.length > 0
    ? existingStoreMemories.map((m: any) => `- ${m.content}`).join('\n')
    : '暂无已提取的记忆';

  const prompt = (customPrompt || DEFAULT_EXTRACTION_PROMPT)
    .replace('{existing_memories}', existingText)
    .replace('{conversation_text}', conversationText);

  const llmMessages: LLMMessage[] = [
    { role: 'user', content: prompt },
  ];

  const config = {
    baseUrl: llmConfig.baseUrl,
    apiKey: llmConfig.apiKey,
    model: llmConfig.model,
    temperature: 0.3,
    topP: llmConfig.topP,
  };

  // 3. 调用 LLM
  let responseText: string;
  try {
    responseText = await chatCompletion(config, llmMessages);
  } catch (err) {
    return { success: false, count: 0, error: (err as Error).message };
  }

  // 4. 解析 JSON
  let parsed: ExtractionResponse;
  try {
    // 尝试直接解析
    parsed = JSON.parse(responseText);
  } catch {
    // 尝试从代码块中提取 JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return { success: false, count: 0, error: 'LLM 返回了无效的 JSON 格式' };
      }
    } else {
      return { success: false, count: 0, error: 'LLM 返回了无效的 JSON 格式' };
    }
  }

  if (!parsed.memories || !Array.isArray(parsed.memories)) {
    parsed = { memories: [] };
  }

  const extractedMemories = parsed.memories.filter((m) => m.content?.trim());

  if (extractedMemories.length === 0) {
    return { success: true, count: 0, error: undefined };
  }

  // 5. 合并到 store（用合并后的完整列表替换，并标记消息已提取）
  const store = useChatStore.getState();
  const existingMemories = store.memories[agentId] || [];
  const messageIds = messages.map((m) => m.id);

  const newMemoryEntries = extractedMemories.map((m) => ({
    content: m.content,
    sourceMsgIds: messageIds,
  }));

  const merged = mergeMemories(existingMemories, newMemoryEntries, agentId);
  store.setMemories(agentId, merged);
  store.markMessagesExtracted(conversationId, messageIds);

  return { success: true, count: extractedMemories.length };
}
