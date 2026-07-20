import { useEffect } from 'react';
import { useAppStore } from '../../store/app-store';
import { useChatStore } from '../../apps/chat/store/chat-store';
import { useLorebookStore } from '../../apps/lorebook/store/lorebook-store';
import { loadData, saveDataDebounced, saveDataImmediately } from './index';

/**
 * 数据持久化 Hook —— 在应用根组件中使用一次
 * 从 SQLite 加载数据注入 Zustand stores，并订阅变化写入
 */
export function usePersistence() {
  useEffect(() => {
    // 从 SQLite 加载已保存的数据并注入 store
    loadData().then((persisted) => {
      if (!persisted) return;

      const state = useChatStore.getState();
      state.setAgents(persisted.agents || []);

      if (persisted.conversations?.length) {
        useChatStore.setState({ conversations: persisted.conversations });
      }

      const mergedMessages = { ...state.messages, ...(persisted.messages || {}) };
      const mergedMemories = { ...state.memories, ...(persisted.memories || {}) };
      useChatStore.setState({ messages: mergedMessages, memories: mergedMemories });

      if (persisted.lorebooks?.length) {
        useLorebookStore.getState().setLorebooks(persisted.lorebooks);
      }

      // restore desktop order
      if (persisted.desktopOrder?.length) {
        useAppStore.setState({ desktopOrder: persisted.desktopOrder });
      }
    }).catch((err) => {
      console.warn('[usePersistence] Load failed:', err);
    });

    // 订阅 store 变化，带防抖写入 SQLite
    const unsubChat = useChatStore.subscribe(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (state: any) => {
        const lorebookState = useLorebookStore.getState();
        const appState = useAppStore.getState();
        saveDataDebounced(state.agents, state.conversations, state.messages, state.memories, lorebookState.lorebooks, appState.desktopOrder);
      }
    );

    // 订阅世界书变化
    const unsubLorebook = useLorebookStore.subscribe(
      (state) => {
        const chatState = useChatStore.getState();
        const appState = useAppStore.getState();
        saveDataDebounced(chatState.agents, chatState.conversations, chatState.messages, chatState.memories, state.lorebooks, appState.desktopOrder);
      }
    );

    // 订阅桌面排序变化
    const unsubApp = useAppStore.subscribe(
      (state) => {
        const chatState = useChatStore.getState();
        const lorebookState = useLorebookStore.getState();
        saveDataDebounced(chatState.agents, chatState.conversations, chatState.messages, chatState.memories, lorebookState.lorebooks, state.desktopOrder);
      }
    );

    // 页面关闭 / 刷新前立即保存
    const handleBeforeUnload = () => {
      const state = useChatStore.getState();
      const lorebookState = useLorebookStore.getState();
      const appState = useAppStore.getState();
      saveDataImmediately(state.agents, state.conversations, state.messages, state.memories, lorebookState.lorebooks, appState.desktopOrder);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsubChat();
      unsubLorebook();
      unsubApp();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
}
