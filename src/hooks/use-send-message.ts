import { useCallback, useRef } from 'react';
import { useChatStore } from '../apps/chat/store/chat-store';
import { useSettingsStore } from '../store/settings-store';
import { streamChat, LLMError } from '../services/llm/index';
import type { LLMMessage } from '../services/llm/types';
import type { Message } from '../apps/chat/types';

export function useSendMessage() {
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (conversationId: string, userContent: string) => {
      const llmConfig = useSettingsStore.getState().llmConfig;
      const addMessage = useChatStore.getState().addMessage;
      const messages = useChatStore.getState().messages[conversationId] || [];

      // 检查配置
      if (!llmConfig.baseUrl || !llmConfig.apiKey || !llmConfig.model) {
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

      // 构造 LLM 消息列表
      const llmMessages: LLMMessage[] = messages.map((m: Message) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

      // 添加用户最新消息
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

      // 发起流式请求
      const abortController = new AbortController();
      abortRef.current = abortController;

      let reasoningAcc = '';
      let contentAcc = '';

      try {
        await streamChat(
          llmConfig,
          llmMessages,
          (chunk) => {
            if (chunk.reasoning) {
              reasoningAcc += chunk.reasoning;
            }
            if (chunk.content) {
              contentAcc += chunk.content;
            }

            // 实时更新消息
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
      } catch (err) {
        const errorMsg =
          err instanceof LLMError ? err.message : '未知错误';
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
