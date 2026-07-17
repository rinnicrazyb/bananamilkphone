import { useCallback, useRef } from 'react';
import { useChatStore } from '../apps/chat/store/chat-store';
import { useSettingsStore } from '../store/settings-store';
import { useLorebookStore } from '../apps/lorebook/store/lorebook-store';
import { streamChat, LLMError } from '../services/llm/index';
import { searchWeb, SEARCH_TOOL_DEFINITION } from '../services/search/index';
import { eventBus } from '../services/event-bus/index';
import { runPipeline } from '../services/transformer-pipeline/index';
import { extractMemories } from '../services/memory-extraction/index';
import type { LLMConfig, LLMMessage, LLMToolDefinition } from '../services/llm/types';
import type { Message, ToolCall } from '../apps/chat/types';
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

  // 1. 搜索工具
  if (displayConfig.enabledSearchProviders && displayConfig.enabledSearchProviders.length > 0) {
    tools.push(SEARCH_TOOL_DEFINITION as LLMToolDefinition);
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
    // 用第一个启用的搜索供应商
    const providerKeys = Object.keys(searchProviders).filter(
      (k) => searchProviders[k].apiKey
    );
    if (providerKeys.length === 0) return '错误：未配置搜索供应商';
    const provider = providerKeys[0];
    try {
      const results = await searchWeb(provider, searchProviders[provider], query);
      if (results.length === 0) return `搜索 "${query}" 无结果`;
      return JSON.stringify(results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
      })));
    } catch (err) {
      return `搜索失败: ${(err as Error).message}`;
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
      if (!status.connected) {
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

          // 执行所有工具调用
          for (const tc of toolCallAcc) {
            const result = await executeToolCall(tc, mcpServers, searchProviders as unknown as Record<string, SearchProviderConfig>);

            // 添加 tool 结果消息
            currentMessages.push({
              role: 'assistant',
              content: '',
              toolCalls: [{ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } }],
            });
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
