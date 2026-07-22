/**
 * chat-send — 消息发送服务（纯函数，不依赖 React Hook 上下文）
 *
 * 从 use-send-message.ts 中提取的核心发送逻辑。
 * 可在任何地方 import 使用（组件、事件回调、后台任务等）。
 *
 * 参考：RikkaHub ChatService.sendMessage()
 */
import { useChatStore } from '../../apps/chat/store/chat-store';
import { useSettingsStore } from '../../store/settings-store';
import { useLorebookStore } from '../../apps/lorebook/store/lorebook-store';
import { streamChat, LLMError } from '../llm/index';
import { searchWeb, scrapeWeb, SEARCH_TOOL_DEFINITION, SCRAPE_TOOL_DEFINITION } from '../search/index';
import { eventBus } from '../event-bus/index';
import { taskManager } from '../background-task/index';
import { updateMessage as dbUpdateMessage } from '../chat-message-db';
import { runPipeline } from '../transformer-pipeline/index';
import { extractMemories } from '../memory-extraction/index';
import type { LLMConfig, LLMMessage, LLMToolDefinition } from '../llm/types';
import { getCurrentMessages } from '../message-nodes/index';
import type { Message, MessagePart, ToolCall, MessageNode } from '../../apps/chat/types';
import type { MCPServer, SearchProviderConfig } from '../../apps/settings/types';
import type { TransformerContext } from '../transformer-pipeline/types';

// ─── 模块级 abort 控制（非 hook 也能 abort）───
let currentAbortController: AbortController | null = null;

/** 中止当前发送 */
export function abortCurrentSend(): void {
  currentAbortController?.abort();
}

/** 在 messageNodes 中查找并更新一条消息，返回 setState 兼容的 { messageNodes, messages } */
function updateNodeMsg(
  allNodes: Record<string, MessageNode[]>,
  convId: string,
  msgId: string,
  updater: (msg: Message) => Message
): { messageNodes: Record<string, MessageNode[]>; messages: Record<string, Message[]> } {
  const nodes = allNodes[convId] || [];
  const newNodes = nodes.map(n => {
    const idx = n.messages.findIndex(m => m.id === msgId);
    if (idx < 0) return n;
    const msgs = n.messages.map((m, i) => i === idx ? updater(m) : m);
    return { ...n, messages: msgs };
  });
  const full = { ...allNodes, [convId]: newNodes };
  const msgs: Record<string, Message[]> = {};
  for (const [k, v] of Object.entries(full)) msgs[k] = getCurrentMessages(v);
  return { messageNodes: full, messages: msgs };
}

// ─── 工具函数 ───

/** 累积 tool_calls 增量 */
function accumulateToolCalls(
  existing: ToolCall[],
  deltas: Array<{ index: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }>
): ToolCall[] {
  const result = [...existing];
  for (const d of deltas) {
    if (!result[d.index]) {
      result[d.index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
    }
    if (d.id) result[d.index].id = d.id;
    if (d.type) result[d.index].type = d.type as 'function';
    if (d.function) {
      if (d.function.name) result[d.index].function.name += d.function.name;
      if (d.function.arguments) result[d.index].function.arguments += d.function.arguments;
    }
  }
  return result;
}

/** 收集当前智能体可用的工具定义 */
function collectToolDefinitions(
  mcpServers: MCPServer[],
  displayConfig: { enabledMCPServerIds?: string[]; enabledSearchProviders?: string[] }
): LLMToolDefinition[] {
  const tools: LLMToolDefinition[] = [];
  if (displayConfig.enabledSearchProviders && displayConfig.enabledSearchProviders.length > 0) {
    tools.push(SEARCH_TOOL_DEFINITION as LLMToolDefinition);
    tools.push(SCRAPE_TOOL_DEFINITION as LLMToolDefinition);
  }
  for (const sid of displayConfig.enabledMCPServerIds ?? []) {
    const server = mcpServers.find((s) => s.id === sid);
    if (!server || !server.enabled || server.status !== 'connected') continue;
    for (const mcpTool of server.discoveredTools ?? []) {
      if (!mcpTool.enabled) continue;
      const prefixedName = `mcp__${server.name}__${mcpTool.name}`;
      tools.push({
        type: 'function',
        function: {
          name: prefixedName,
          description: mcpTool.description || `${server.name} 提供的工具`,
          parameters: Object.keys(mcpTool.inputSchema).length > 0
            ? mcpTool.inputSchema as Record<string, unknown>
            : { type: 'object', properties: {} },
        },
      });
    }
  }
  return tools;
}

/** 执行单个工具调用 */
async function executeToolCall(
  toolCall: ToolCall,
  mcpServers: MCPServer[],
  searchProviders: Record<string, SearchProviderConfig>,
): Promise<string> {
  const { name, arguments: argsStr } = toolCall.function;
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(argsStr); } catch { /* ignore */ }

  if (name === 'search_web') {
    const query = (args.query || '').toString();
    if (!query) return '错误：搜索关键词为空';
    const providerKeys = Object.keys(searchProviders).filter(k => searchProviders[k].apiKey);
    if (providerKeys.length === 0) return '错误：未配置搜索供应商';
    const provider = providerKeys[0];
    try {
      const result = await searchWeb(provider, searchProviders[provider], query);
      const items = result.items || [];
      if (items.length === 0) return `搜索 "${query}" 无结果`;
      return JSON.stringify({
        answer: result.answer,
        items: items.map(r => ({ title: r.title, url: r.url, content: r.content })),
        images: result.images,
      });
    } catch (err) {
      return `搜索失败: ${(err as Error).message}`;
    }
  }

  if (name === 'scrape_web') {
    const url = (args.url || '').toString();
    if (!url) return '错误：URL 为空';
    const providerKeys = Object.keys(searchProviders).filter(k => searchProviders[k].apiKey);
    if (providerKeys.length === 0) return '错误：未配置搜索供应商';
    const provider = providerKeys[0];
    try {
      const result = await scrapeWeb(provider, searchProviders[provider], url);
      return JSON.stringify({ url: result.url, content: result.content, metadata: result.metadata });
    } catch (err) {
      return `抓取失败: ${(err as Error).message}`;
    }
  }

  if (name.startsWith('mcp__')) {
    const parts = name.split('__');
    const serverName = parts[1];
    const toolName = parts.slice(2).join('__');
    const server = mcpServers.find((s) => s.name === serverName);
    if (!server) return `错误：未找到 MCP 服务器 "${serverName}"`;
    try {
      const { connectToServer, callToolOnServer } = await import('../mcp-client/index');
      const status = await connectToServer(server);
      if (status.state !== 'connected') return `MCP 连接失败: ${status.error || '未知错误'}`;
      const result = await callToolOnServer(server.id, toolName, args as Record<string, unknown>);
      if (result.isError) {
        const texts = (result.content || []).filter(c => c.type === 'text').map(c => c.text || '');
        return `工具执行错误: ${texts.join('\n')}`;
      }
      const texts = (result.content || []).filter(c => c.type === 'text').map(c => c.text || '');
      return texts.join('\n') || '工具已执行，无返回内容';
    } catch (err) {
      return `MCP 工具调用失败: ${(err as Error).message}`;
    }
  }

  return `错误：未知工具 "${name}"`;
}

// ─── 核心发送函数 ───

/**
 * 发送消息到 LLM（纯函数，可在任何上下文调用）
 *
 * @param conversationId - 对话 ID
 * @param userContent - 用户消息内容
 * @param options - 可选参数（用于重新发送场景）
 *   - fromResendMsgId: 重新发送时，要替换的原消息 ID（若指定，则发送前截断到该消息之前）
 */
export async function sendMessage(
  conversationId: string,
  userContent: string,
  options?: { fromResendMsgId?: string; excludeNodeIds?: string[] }
): Promise<void> {
  const state = useChatStore.getState();
  const llmConfig = useSettingsStore.getState().llmConfig;
  const mcpServers = useSettingsStore.getState().mcpServers;
  const searchProviders = useSettingsStore.getState().searchProviders;
  const addMessage = state.addMessage;
  // 使用 getCurrentMessages 获取当前选中分支的消息（对齐 RikkaHub currentMessages）
  let messages = state.getCurrentMessages(conversationId);
  const conversations = state.conversations;
  const agents = state.agents;

  const conv = conversations.find((c) => c.id === conversationId);
  const agent = agents.find((a) => a.id === conv?.agentId);
  const displayConfig = agent?.displayConfig;

  // 若指定了重新发送的消息，截断到该消息之前
  if (options?.fromResendMsgId) {
    const resendIdx = messages.findIndex(m => m.id === options.fromResendMsgId);
    if (resendIdx >= 0) {
      messages = messages.slice(0, resendIdx);
      // 同步更新 store 中的消息列表（移除旧消息及其后续）
      const allMsgs = state.messages[conversationId] || [];
      useChatStore.setState(s => ({
        messages: { ...s.messages, [conversationId]: allMsgs.slice(0, resendIdx) }
      }));
    }
  }

  // 若智能体选择了 API 预设，使用预设的 baseUrl/apiKey；否则使用全局配置
  const presetId = agent?.settings.presetId;
  const preset = presetId ? useSettingsStore.getState().llmPresets.find((p) => p.id === presetId) : undefined;
  const effectiveBaseUrl = preset?.baseUrl || llmConfig.baseUrl;
  const effectiveApiKey = preset?.apiKey || llmConfig.apiKey;
  const effectiveModel = preset?.model || agent?.settings.model || llmConfig.model;
  const effectiveTemperature = preset?.temperature ?? agent?.settings.temperature ?? llmConfig.temperature;
  const effectiveTopP = preset?.topP ?? agent?.settings.topP ?? llmConfig.topP;

  if (!effectiveBaseUrl || !effectiveApiKey || !effectiveModel) {
    addMessage(conversationId, {
      id: `error-${Date.now()}`,
      conversationId,
      role: 'system',
      content: '请先在设置中配置 LLM API（地址 / Key / 模型）',
      timestamp: Date.now(),
      status: 'sent',
    });
    return;
  }

  // 用户已发送消息 → 将所有 AI 消息标记为已读
  const curState = useChatStore.getState();
  const curNodes = curState.messageNodes[conversationId] || [];
  let hasUnreadAi = false;
  const readNodes = curNodes.map(n => {
    if (n.role !== 'assistant') return n;
    const newMsgs = n.messages.map(m => {
      if (m.status === 'sent') { hasUnreadAi = true; return { ...m, status: 'read' as const }; }
      return m;
    });
    return { ...n, messages: newMsgs };
  });
  if (hasUnreadAi) {
    const full = { ...curState.messageNodes, [conversationId]: readNodes };
    const newMsgs: Record<string, Message[]> = {};
    for (const [k, v] of Object.entries(full)) newMsgs[k] = getCurrentMessages(v);
    useChatStore.setState({ messageNodes: full, messages: newMsgs });
  }

  const effectiveConfig: LLMConfig = {
    baseUrl: effectiveBaseUrl,
    apiKey: effectiveApiKey,
    model: effectiveModel,
    temperature: effectiveTemperature,
    topP: effectiveTopP,
    reasoningEffort: agent?.displayConfig?.thinkingEffort
      ? agent.displayConfig.thinkingEffort >= 70 ? 'high'
        : agent.displayConfig.thinkingEffort >= 40 ? 'medium' : 'low'
      : undefined,
  };

  const tools = displayConfig ? collectToolDefinitions(mcpServers, displayConfig) : [];

  const allLorebooks = useLorebookStore.getState().lorebooks;
  const boundBookIds = agent?.settings?.worldBookIds ?? [];
  const boundLorebooks = allLorebooks.filter((b) => boundBookIds.includes(b.id));
  const ctx: TransformerContext = {
    agent,
    memories: state.memories[agent?.id ?? ''] ?? [],
    displayConfig,
    mcpServers,
    searchProviders: searchProviders as unknown as Record<string, SearchProviderConfig>,
    lorebooks: boundLorebooks,
  };

  // 构造基础消息（仅包含选中分支，排除 excludeNodeIds 指定的节点）
  const baseMessages: LLMMessage[] = [];
  for (const m of messages) {
    if (m.role === 'user' && m.content === userContent && m.id.startsWith('msg-') && Date.now() - m.timestamp < 5000) {
      continue; // 跳过 ChatInput 刚加入的重复用户消息
    }
    if (options?.excludeNodeIds?.includes(m.nodeId || '')) continue; // 跳过被排除的分支
    baseMessages.push(
      m.role === 'tool'
        ? { role: 'tool', content: m.content, toolCallId: m.toolCallId }
        : { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content, toolCalls: m.toolCalls as any }
    );
  }
  const alreadyHasUserMsg = baseMessages.some((m) => m.role === 'user' && m.content === userContent);
  if (!alreadyHasUserMsg) {
    baseMessages.push({ role: 'user', content: userContent });
  }

  const llmMessages = runPipeline(baseMessages, ctx);

  const replyId = `reply-${Date.now()}`;
  addMessage(conversationId, {
    id: replyId,
    conversationId,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    status: 'sending',
  });

  eventBus.emit('chat:message-sent', { conversationId, content: userContent });

  const abortController = new AbortController();
  currentAbortController = abortController;
  const agentId = conv?.agentId || '';
  taskManager.startTask(conversationId, agentId, async (signal) => {
    signal.addEventListener('abort', () => abortController.abort());
  });

  try {
    let currentMessages = [...llmMessages];
    const maxIterations = 10;
    let allContent = '';
    let allReasoning = '';

    for (let iter = 0; iter < maxIterations; iter++) {
      let reasoningAcc = '';
      let contentAcc = '';
      let toolCallAcc: ToolCall[] = [];
      let finalFinishReason: string | null = null;
      let usageData: { prompt: number; completion: number; cached?: number } | undefined;
      let reasoningStartTime = 0;
      let reasoningDuration: number | undefined;

      const roundReplyId = iter === 0 ? replyId : `reply-${Date.now()}-${iter}`;
      if (iter > 0) {
        addMessage(conversationId, {
          id: roundReplyId,
          conversationId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          status: 'sending',
        });
      }

      await streamChat(
        effectiveConfig,
        currentMessages,
        (chunk) => {
          if (chunk.reasoning) {
            reasoningAcc += chunk.reasoning;
            if (reasoningStartTime === 0) reasoningStartTime = Date.now();
          }
          if (chunk.content) {
            contentAcc += chunk.content;
            if (reasoningStartTime > 0 && !chunk.reasoning && !reasoningDuration) {
              reasoningDuration = Date.now() - reasoningStartTime;
            }
          }
          if (chunk.toolCallDeltas) {
            toolCallAcc = accumulateToolCalls(toolCallAcc, chunk.toolCallDeltas);
          }
          if (chunk.finishReason) {
            finalFinishReason = chunk.finishReason;
            if (reasoningStartTime > 0 && !reasoningDuration) {
              reasoningDuration = Date.now() - reasoningStartTime;
            }
          }
          if (chunk.usage) {
            usageData = {
              prompt: chunk.usage.promptTokens,
              completion: chunk.usage.completionTokens,
              cached: chunk.usage.cachedTokens,
            };
          }

          function buildParts(): MessagePart[] {
            const parts: MessagePart[] = [];
            if (reasoningAcc) {
              parts.push({ type: 'reasoning', content: reasoningAcc, finishedAt: finalFinishReason ? Date.now() : undefined });
            }
            if (contentAcc) {
              parts.push({ type: 'text', content: contentAcc });
            }
            for (const tc of toolCallAcc) {
              parts.push({
                type: 'tool_call',
                toolCallId: tc.id,
                toolName: tc.function.name,
                input: tc.function.arguments,
                isExecuted: false,
                approvalState: 'auto',
              });
            }
            return parts;
          }

          const store = useChatStore.getState();
          const streamUpdate = updateNodeMsg(store.messageNodes, conversationId, roundReplyId, (m) => ({
            ...m,
            content: contentAcc,
            reasoning: reasoningAcc || undefined,
            toolCalls: toolCallAcc.length > 0 ? toolCallAcc : undefined,
            status: 'sent' as const,
            parts: buildParts(),
            tokenCount: usageData ? { prompt: usageData.prompt, completion: usageData.completion, cached: usageData.cached ?? 0 } : m.tokenCount,
            reasoningDuration: reasoningDuration || m.reasoningDuration,
          }));
          useChatStore.setState(streamUpdate);
        },
        {
          tools: tools.length > 0 ? tools : undefined,
          toolChoice: tools.length > 0 ? 'auto' : undefined,
          signal: abortController.signal,
        }
      );

      allContent += contentAcc;
      allReasoning += reasoningAcc;

      if (finalFinishReason !== 'tool_calls' || toolCallAcc.length === 0) break;

      currentMessages.push({
        role: 'assistant',
        content: contentAcc || '',
        toolCalls: toolCallAcc.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } })),
      });

      for (const tc of toolCallAcc) {
        const result = await executeToolCall(tc, mcpServers, searchProviders as unknown as Record<string, SearchProviderConfig>);
        currentMessages.push({ role: 'tool', content: result, toolCallId: tc.id });
        addMessage(conversationId, {
          id: `tool-${tc.id}`,
          conversationId,
          role: 'tool',
          content: result,
          toolCallId: tc.id,
          timestamp: Date.now(),
          status: 'sent',
        });
      }

      const toolResults: Record<string, string> = {};
      for (const tc of toolCallAcc) {
        toolResults[tc.id] = tc.function.name;
      }
      const storeNow = useChatStore.getState();
      const toolUpd = updateNodeMsg(storeNow.messageNodes, conversationId, roundReplyId, (m) => {
        if (!m.parts) return m;
        const curMsgs = storeNow.getCurrentMessages(conversationId);
        return {
          ...m,
          parts: m.parts.map((p) => {
            if (p.type === 'tool_call' && toolResults[p.toolCallId]) {
              const toolMsg = curMsgs.find((tm) => tm.role === 'tool' && tm.toolCallId === p.toolCallId);
              return { ...p, output: toolMsg?.content || '无返回', isExecuted: true };
            }
            return p;
          }),
        };
      });
      useChatStore.setState(toolUpd);
    }

    // ── 流式完成后持久化到 DB（搜索功能依赖 DB 中的完整内容）──
    {
      const persistState = useChatStore.getState();
      const persistMsgs = persistState.getCurrentMessages(conversationId);
      for (const m of persistMsgs) {
        if (m.id.startsWith('reply-')) {
          dbUpdateMessage(m.id, { content: m.content, reasoning: m.reasoning, parts: m.parts, tokenCount: m.tokenCount, status: m.status }).catch(() => {});
        }
      }
    }

    // ── 关键词触发记忆提取 ──
    if (agent?.displayConfig?.extractionKeywordEnabled) {
      const keywords = agent.displayConfig.extractionKeywords ?? [];
      const hasTrigger = keywords.some((kw) => kw && userContent.includes(kw));
      setTimeout(() => {
        const currentState = useChatStore.getState();
        const convMsgs = currentState.messages[conversationId] || [];
        const unextracted = convMsgs.filter((m) => !m.memoryExtracted);
        if (hasTrigger && unextracted.length > 0) {
          extractMemories({
            messages: unextracted,
            agentName: agent.name,
            agentId: agent.id,
            conversationId,
            customPrompt: agent.displayConfig?.extractionPrompt,
          }).catch(() => {});
        }
      }, 0);
    }

    eventBus.emit('chat:message-received', { conversationId, replyId, content: allContent });

    // 标记用户消息为已读
    const afterStore = useChatStore.getState();
    const afterMsgs = afterStore.getCurrentMessages(conversationId);
    let userMsgId: string | undefined;
    for (let i = afterMsgs.length - 1; i >= 0; i--) {
      if (afterMsgs[i].role === 'user' && afterMsgs[i].status === 'sent') {
        userMsgId = afterMsgs[i].id;
        break;
      }
    }
    if (userMsgId) {
      const readUpd = updateNodeMsg(afterStore.messageNodes, conversationId, userMsgId, (m) => ({
        ...m, status: 'read' as const,
      }));
      useChatStore.setState(readUpd);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    const errorMsg = err instanceof LLMError ? err.message : '消息发送失败';
    const store = useChatStore.getState();
    const errUpd = updateNodeMsg(store.messageNodes, conversationId, replyId, (m) => ({
      ...m, content: m.content || errorMsg, status: 'failed' as const,
    }));
    useChatStore.setState(errUpd);
  } finally {
    currentAbortController = null;
  }
}

/** 重新生成 — 在指定 AI 消息位置重新触发 LLM 生成，旧回复保留为分支 */
export async function regenerateMessage(conversationId: string, assistantMsgId: string): Promise<void> {
  const state = useChatStore.getState();
  const convMsgs = state.messages[conversationId] || [];
  const sorted = [...convMsgs].sort((a, b) => a.timestamp - b.timestamp);
  const idx = sorted.findIndex(m => m.id === assistantMsgId);
  if (idx < 0) return;

  // 往前找最近的 user 消息
  let userMsg: Message | undefined;
  for (let i = idx - 1; i >= 0; i--) {
    if (sorted[i].role === 'user') { userMsg = sorted[i]; break; }
  }
  if (!userMsg) return;

  // 不截断 store，保留旧 AI 回复作为历史分支。
  // sendMessage 从 store 读取全量消息，旧回复会作为上下文发给 LLM——但没关系，
  // LLM 知道哪些消息是它自己的历史输出，能够区分。
  // 新回复通过 addMessage 追加到末尾，若角色与末尾消息相同则共享 nodeId，
  // 从而被 getVisibleMessages 识别为同一节点的分支。
  // 找到旧 AI 回复的 nodeId，传给 sendMessage 以排除其在 LLM 上下文中
  const oldReplyNodeId = sorted[idx].nodeId;
  if (!oldReplyNodeId) {
    await sendMessage(conversationId, userMsg.content);
  } else {
    await sendMessage(conversationId, userMsg.content, { excludeNodeIds: [oldReplyNodeId] });
  }
}
