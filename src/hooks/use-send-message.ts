import { useCallback, useRef } from 'react';
import { useChatStore } from '../apps/chat/store/chat-store';
import { useSettingsStore } from '../store/settings-store';
import { useLorebookStore } from '../apps/lorebook/store/lorebook-store';
import { streamChat, LLMError } from '../services/llm/index';
import { searchWeb, scrapeWeb, SEARCH_TOOL_DEFINITION, SCRAPE_TOOL_DEFINITION } from '../services/search/index';
import { eventBus } from '../services/event-bus/index';
import { runPipeline } from '../services/transformer-pipeline/index';
import { extractMemories } from '../services/memory-extraction/index';
import type { LLMConfig, LLMMessage, LLMToolDefinition } from '../services/llm/types';
import type { Message, MessagePart, ToolCall } from '../apps/chat/types';
import type { MCPServer, SearchProviderConfig } from '../apps/settings/types';
import type { TransformerContext } from '../services/transformer-pipeline/types';

/** 累积 tool_calls 增量 */
function accumulateToolCalls(
  existing: ToolCall[],
  deltas: Array<{ index: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }>
): ToolCall[] {
  const result = [...existing];
  for (const d of deltas) {
    if (!result[d.index]) {
      result[d.index] = {
        id: d.id || '',
        type: 'function',
        function: { name: '', arguments: '' },
      };
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

  // 1. 搜索工具 + 抓取工具
  if (displayConfig.enabledSearchProviders && displayConfig.enabledSearchProviders.length > 0) {
    tools.push(SEARCH_TOOL_DEFINITION as LLMToolDefinition);
    tools.push(SCRAPE_TOOL_DEFINITION as LLMToolDefinition);
  }

  // 2. MCP 工具
  for (const sid of displayConfig.enabledMCPServerIds ?? []) {
    const server = mcpServers.find((s) => s.id === sid);
    if (!server || !server.enabled || server.status !== 'connected') continue;
    for (const mcpTool of server.discoveredTools ?? []) {
      if (!mcpTool.enabled) continue;
      // MCP 工具名加前缀避免冲突：mcp__{serverName}__{toolName}
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

  // 搜索工具
  if (name === 'search_web') {
    const query = (args.query || '').toString();
    if (!query) return '错误：搜索关键词为空';
    const providerKeys = Object.keys(searchProviders).filter(
      (k) => searchProviders[k].apiKey
    );
    if (providerKeys.length === 0) return '错误：未配置搜索供应商';
    const provider = providerKeys[0];
    try {
      const result = await searchWeb(provider, searchProviders[provider], query);
      const items = result.items || [];
      if (items.length === 0) return `搜索 "${query}" 无结果`;
      return JSON.stringify({
        answer: result.answer,
        items: items.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
        })),
        images: result.images,
      });
    } catch (err) {
      return `搜索失败: ${(err as Error).message}`;
    }
  }

  // 抓取网页工具
  if (name === 'scrape_web') {
    const url = (args.url || '').toString();
    if (!url) return '错误：URL 为空';
    const providerKeys = Object.keys(searchProviders).filter(
      (k) => searchProviders[k].apiKey
    );
    if (providerKeys.length === 0) return '错误：未配置搜索供应商';
    const provider = providerKeys[0];
    try {
      const result = await scrapeWeb(provider, searchProviders[provider], url);
      return JSON.stringify({
        url: result.url,
        content: result.content,
        metadata: result.metadata,
      });
    } catch (err) {
      return `抓取失败: ${(err as Error).message}`;
    }
  }

  // MCP 工具（使用 @modelcontextprotocol/sdk）
  if (name.startsWith('mcp__')) {
    const parts = name.split('__');
    const serverName = parts[1];
    const toolName = parts.slice(2).join('__');
    const server = mcpServers.find((s) => s.name === serverName);
    if (!server) return `错误：未找到 MCP 服务器 "${serverName}"`;

    try {
      // 连接服务器（SDK 自动处理 initialize 握手）
      const { connectToServer, callToolOnServer } = await import('../services/mcp-client/index');
      const status = await connectToServer(server);
      if (status.state !== 'connected') {
        return `MCP 连接失败: ${status.error || '未知错误'}`;
      }

      // 调用工具
      const result = await callToolOnServer(server.id, toolName, args as Record<string, unknown>);

      if (result.isError) {
        const texts = (result.content || [])
          .filter((c) => c.type === 'text')
          .map((c) => c.text || '');
        return `工具执行错误: ${texts.join('\n')}`;
      }

      const texts = (result.content || [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text || '');
      return texts.join('\n') || '工具已执行，无返回内容';
    } catch (err) {
      return `MCP 工具调用失败: ${(err as Error).message}`;
    }
  }

  return `错误：未知工具 "${name}"`;
}

export function useSendMessage() {
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (conversationId: string, userContent: string) => {
      const state = useChatStore.getState();
      const llmConfig = useSettingsStore.getState().llmConfig;
      const mcpServers = useSettingsStore.getState().mcpServers;
      const searchProviders = useSettingsStore.getState().searchProviders;
      const addMessage = state.addMessage;
      const messages = state.messages[conversationId] || [];
      const conversations = state.conversations;
      const agents = state.agents;

      const conv = conversations.find((c) => c.id === conversationId);
      const agent = agents.find((a) => a.id === conv?.agentId);
      const displayConfig = agent?.displayConfig;

      const effectiveModel = agent?.settings.model || llmConfig.model;
      if (!llmConfig.baseUrl || !llmConfig.apiKey || !effectiveModel) {
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
      const { messages: curMessages } = useChatStore.getState();
      const curConvMsgs = curMessages[conversationId] || [];
      let hasUnreadAi = false;
      const aiReadMarked = curConvMsgs.map((m) => {
        if (m.role === 'assistant' && m.status === 'sent') {
          hasUnreadAi = true;
          return { ...m, status: 'read' as const };
        }
        return m;
      });
      if (hasUnreadAi) {
        useChatStore.setState({
          messages: { ...curMessages, [conversationId]: aiReadMarked },
        });
      }

      const effectiveConfig: LLMConfig = {
        baseUrl: llmConfig.baseUrl,
        apiKey: llmConfig.apiKey,
        model: effectiveModel,
        temperature: agent?.settings.temperature ?? llmConfig.temperature,
        topP: agent?.settings.topP ?? llmConfig.topP,
        reasoningEffort: agent?.displayConfig?.thinkingEffort
          ? agent.displayConfig.thinkingEffort >= 70 ? 'high'
            : agent.displayConfig.thinkingEffort >= 40 ? 'medium'
            : 'low'
          : undefined,
      };

      // 收集可用工具
      const tools = displayConfig
        ? collectToolDefinitions(mcpServers, displayConfig)
        : [];

      // 构造 TransformerContext（传递给管道）
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

      // 构造基础消息（历史消息 + 用户输入）
      const baseMessages: LLMMessage[] = [];
      for (const m of messages) {
        baseMessages.push(
          m.role === 'tool'
            ? { role: 'tool', content: m.content, toolCallId: m.toolCallId }
            : { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content, toolCalls: m.toolCalls as any }
        );
      }
      baseMessages.push({ role: 'user', content: userContent });

      // 通过 Transformer 管道拼装最终消息
      const llmMessages = runPipeline(baseMessages, ctx);

      // 创建回复消息占位
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
      abortRef.current = abortController;

      try {
        // ─── 工具调用主循环 ───
        let currentMessages = [...llmMessages];
        let maxIterations = 10;
        let allContent = '';
        let allReasoning = '';

        for (let iter = 0; iter < maxIterations; iter++) {
          let reasoningAcc = '';
          let contentAcc = '';
          let toolCallAcc: ToolCall[] = [];
          let finalFinishReason: string | null = null;
          let usageData: { prompt: number; completion: number; cached?: number } | undefined;

          // 创建本轮回复消息（首次或工具调用后的再次请求）
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
              if (chunk.reasoning) reasoningAcc += chunk.reasoning;
              if (chunk.content) contentAcc += chunk.content;
              if (chunk.toolCallDeltas) {
                toolCallAcc = accumulateToolCalls(toolCallAcc, chunk.toolCallDeltas);
              }
              if (chunk.finishReason) finalFinishReason = chunk.finishReason;
              if (chunk.usage) {
                usageData = {
                  prompt: chunk.usage.promptTokens,
                  completion: chunk.usage.completionTokens,
                  cached: chunk.usage.cachedTokens,
                };
              }

                            // 构建 parts 数组（RikkaHub 风格多类型消息）
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

// 实时更新消息内容（含 token 用量）
              const store = useChatStore.getState();
              const msgs = store.messages[conversationId] || [];
              const updated = msgs.map((m: Message) =>
                m.id === roundReplyId
                  ? {
                      ...m,
                      content: contentAcc,
                      reasoning: reasoningAcc || undefined,
                      toolCalls: toolCallAcc.length > 0 ? toolCallAcc : undefined,
                      status: 'sent' as const,
                      parts: buildParts(),
                      tokenCount: usageData ? {
                        prompt: usageData.prompt,
                        completion: usageData.completion,
                        cached: usageData.cached ?? 0,
                      } : m.tokenCount,
                    }
                  : m
              );
              useChatStore.setState({
                messages: { ...store.messages, [conversationId]: updated },
              });
            },
            {
              tools: tools.length > 0 ? tools : undefined,
              toolChoice: tools.length > 0 ? 'auto' : undefined,
              signal: abortController.signal,
            }
          );

          allContent += contentAcc;
          allReasoning += reasoningAcc;

          // 如果不是 tool_calls 结束，退出循环
          if (finalFinishReason !== 'tool_calls' || toolCallAcc.length === 0) {
            break;
          }

          // ── 将 LLM 返回的原始 assistant 消息（含全部 tool_calls）加入消息序列 ──
          // 注意：所有 tool_calls 必须在同一条 assistant 消息中，不能拆分（DeepSeek 等 API 严格要求）
          currentMessages.push({
            role: 'assistant',
            content: contentAcc || '',
            toolCalls: toolCallAcc.map(tc => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.function.name, arguments: tc.function.arguments }
            })),
          });

          // 执行所有工具调用，每个工具结果作为独立的 tool 消息
          for (const tc of toolCallAcc) {
            const result = await executeToolCall(tc, mcpServers, searchProviders as unknown as Record<string, SearchProviderConfig>);

            // 添加 tool 结果消息
            currentMessages.push({
              role: 'tool',
              content: result,
              toolCallId: tc.id,
            });

            // 把工具调用和结果也存到聊天消息中
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

          // 工具执行完毕：更新 assistant 消息的 parts，标记 tool_call 为已执行
          const toolResults: Record<string, string> = {};
          for (const tc of toolCallAcc) {
            toolResults[tc.id] = tc.function.name;
          }
          const storeNow = useChatStore.getState();
          const msgsNow = storeNow.messages[conversationId] || [];
          const updatedWithTools = msgsNow.map((m) =>
            m.id === roundReplyId && m.parts
              ? {
                  ...m,
                  parts: m.parts.map((p) => {
                    if (p.type === 'tool_call' && toolResults[p.toolCallId]) {
                      // 从最近的 tool 消息中找结果
                      const toolMsg = msgsNow.find(
                        (tm) => tm.role === 'tool' && tm.toolCallId === p.toolCallId
                      );
                      return { ...p, output: toolMsg?.content || '无返回', isExecuted: true };
                    }
                    return p;
                  }),
                }
              : m
          );
          useChatStore.setState({
            messages: { ...storeNow.messages, [conversationId]: updatedWithTools },
          });

          // 继续下一轮迭代
        }

        // ── 关键词触发记忆提取 ──
        if (agent?.displayConfig?.extractionKeywordEnabled) {
          const keywords = agent.displayConfig.extractionKeywords ?? [];
          const hasTrigger = keywords.some((kw) => kw && userContent.includes(kw));
          // 使用 setTimeout 延迟执行，不阻塞主流程
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

        // 消息接收事件
        eventBus.emit('chat:message-received', {
          conversationId,
          replyId,
          content: allContent,
        });

        // 标记用户消息为已读
        const afterStore = useChatStore.getState();
        const afterMsgs = afterStore.messages[conversationId] || [];
        let userMsgIdx = -1;
        for (let i = afterMsgs.length - 1; i >= 0; i--) {
          if (afterMsgs[i].role === 'user' && afterMsgs[i].status === 'sent') {
            userMsgIdx = i;
            break;
          }
        }
        if (userMsgIdx !== -1) {
          const markRead = [...afterMsgs];
          markRead[userMsgIdx] = { ...markRead[userMsgIdx], status: 'read' as const };
          useChatStore.setState({
            messages: { ...afterStore.messages, [conversationId]: markRead },
          });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const errorMsg = err instanceof LLMError ? err.message : '消息发送失败';
        const store = useChatStore.getState();
        const msgs = store.messages[conversationId] || [];
        const updated = msgs.map((m: Message) =>
          m.id === replyId
            ? { ...m, content: m.content || errorMsg, status: 'failed' as const }
            : m
        );
        useChatStore.setState({
          messages: { ...store.messages, [conversationId]: updated },
        });
      } finally {
        abortRef.current = null;
      }
    },
    []
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { sendMessage, abort };
}
