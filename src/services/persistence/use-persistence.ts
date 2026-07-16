import { useEffect } from 'react';
import { useChatStore } from '../../apps/chat/store/chat-store';
import { useLorebookStore } from '../../apps/lorebook/store/lorebook-store';
import { loadData, saveDataDebounced, saveDataImmediately } from './index';

/**
 * 数据持久化 Hook —— 在应用根组件中使用一次
 * 自动加载已保存的数据，并订阅 store 变化带防抖写入
 */
export function usePersistence() {
  useEffect(() => {
    // 从 localStorage 加载已保存的数据并注入 store
    const persisted = loadData();
    if (persisted) {
      const state = useChatStore.getState();
      state.setAgents(persisted.agents || []);
      // conversations 需要逐个添加（可能含重复）
      if (persisted.conversations?.length) {
        state.conversations.length = 0;
        // 直接替换 conversations 数组
        useChatStore.setState({ conversations: persisted.conversations });
      }
      // 合并消息
      const mergedMessages = { ...state.messages, ...(persisted.messages || {}) };
      // 合并记忆（兼容 v1 无 memories 的情况）
      const mergedMemories = { ...state.memories, ...(persisted.memories || {}) };
      useChatStore.setState({ messages: mergedMessages, memories: mergedMemories });

      // 加载世界书数据
      if (persisted.lorebooks?.length) {
        useLorebookStore.getState().setLorebooks(persisted.lorebooks);
      }
    }

    // 订阅 store 变化，带防抖写入
    const unsubChat = useChatStore.subscribe(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (state: any) => {
        saveDataDebounced(state.agents, state.conversations, state.messages, state.memories, useLorebookStore.getState().lorebooks);
      }
    );

    // 订阅世界书变化
    const unsubLorebook = useLorebookStore.subscribe(
      (state) => {
        const chatState = useChatStore.getState();
        saveDataDebounced(chatState.agents, chatState.conversations, chatState.messages, chatState.memories, state.lorebooks);
      }
    );

    // 页面关闭 / 刷新前立即保存
    const handleBeforeUnload = () => {
      const state = useChatStore.getState();
      const lorebookState = useLorebookStore.getState();
      saveDataImmediately(state.agents, state.conversations, state.messages, state.memories, lorebookState.lorebooks);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsubChat();
      unsubLorebook();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
}
