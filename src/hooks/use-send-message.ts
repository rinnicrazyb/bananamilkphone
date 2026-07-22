/**
 * useSendMessage — 发送消息 hook（薄包装，底层逻辑委托给 chat-send 服务）
 *
 * 保持与 ChatInput 现有调用方式兼容，同时让 ChatView 等非 hook 上下文
 * 可以直接 import chat-send 服务使用。
 */
import { useCallback } from 'react';
import { sendMessage as sendMessageService, abortCurrentSend, regenerateMessage } from '../services/chat-send/index';

export function useSendMessage() {
  const sendMessage = useCallback(
    async (conversationId: string, userContent: string) => {
      await sendMessageService(conversationId, userContent);
    },
    []
  );

  const abort = useCallback(() => {
    abortCurrentSend();
  }, []);

  return { sendMessage, abort, regenerateMessage };
}
