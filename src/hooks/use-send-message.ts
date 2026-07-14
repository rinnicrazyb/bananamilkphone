import { useCallback, useRef } from 'react';
import { useChatStore } from '../apps/chat/store/chat-store';
import { useSettingsStore } from '../store/settings-store';
import { streamChat, LLMError } from '../services/llm/index';
import { eventBus } from '../services/event-bus/index';
import type { LLMConfig, LLMMessage } from '../services/llm/types';
import type { Message } from '../apps/chat/types';

export function useSendMessage() {
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (conversationId: string, userContent: string) => {
      const state = useChatStore.getState();
      const llmConfig = useSettingsStore.getState().llmConfig;
      const addMessage = state.addMessage;
      const messages = state.messages[conversationId] || [];
      const conversations = state.conversations;
      const agents = state.agents;

      // 找到当前对话对应的智能体
      const conv = conversations.find((c) => c.id === conversationId);
      const agent = agents.find((a) => a.id === conv?.agentId);

      // 检查配置
      const effectiveModel = agent?.settings.model || llmConfig.model;
      if (!llmConfig.baseUrl || !llmConfig.apiKey || !effectiveModel) {
        addMessage(conversationId, {
          id: `error-${Date.now()}`,
          conversationId,
          role: 'system',
          content: '⚠️ 请先在设置中配置 LLM API（地址 / Key / 模型）',
          timestamp: Date.now(),
          status: 'sent',
        });
        return;
      }

      // 合并 LLM 配置（智能体设置 > 全局设置）
      const effectiveConfig: LLMConfig = {
        baseUrl: llmConfig.baseUrl,
        apiKey: llmConfig.apiKey,
        model: effectiveModel,
        temperature: agent?.settings.temperature ?? llmConfig.temperature,
        topP: agent?.settings.topP ?? llmConfig.topP,
      };

      // 构造消息列表：系统提示词在最前，然后是历史消息，最后是用户最新输入
      const llmMessages: LLMMessage[] = [];

      if (agent?.settings.systemPrompt) {
        llmMessages.push({ role: 'system', content: agent.settings.systemPrompt });
      }

      for (const m of messages) {
        llmMessages.push({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        });
      }

      llmMessages.push({ role: 'user', content: userContent });

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

      // 发出消息已发送事件
      eventBus.emit('chat:message-sent', { conversationId, content: userContent });

      const abortController = new AbortController();
      abortRef.current = abortController;

      let reasoningAcc = '';
      let contentAcc = '';

      try {
        await streamChat(
          effectiveConfig,
          llmMessages,
          (chunk) => {
            if (chunk.reasoning) reasoningAcc += chunk.reasoning;
            if (chunk.content) contentAcc += chunk.content;

            const store = useChatStore.getState();
            const msgs = store.messages[conversationId] || [];
            const updated = msgs.map((m: Message) =>
              m.id === replyId
                ? {
                    ...m,
                    content: contentAcc,
                    reasoning: reasoningAcc || undefined,
                    status: 'sent' as const,
                  }
                : m
            );
            useChatStore.setState({
              messages: { ...store.messages, [conversationId]: updated },
            });
          },
          abortController.signal
        );

        // 发出消息已接收事件
        eventBus.emit('chat:message-received', {
          conversationId,
          replyId,
          content: contentAcc,
        });
      } catch (err) {
        const errorMsg = err instanceof LLMError ? err.message : '未知错误';
        const store = useChatStore.getState();
        const msgs = store.messages[conversationId] || [];
        const updated = msgs.map((m: Message) =>
          m.id === replyId
            ? { ...m, content: contentAcc || errorMsg, status: 'failed' as const }
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
