import { useEffect } from 'react';
import { useChatStore } from '../../apps/chat/store/chat-store';
import { loadData, saveDataDebounced, saveDataImmediately } from './index';

/**
 * 数据持久化 Hook —— 在应用根组件中使用一次
 * 自动加载已保存的数据，并订阅 store 变化带防抖写入
 */
export function usePersistence() {
  useEffect(() => {
    // 加载已保存的数据
    const saved = loadData();
    if (saved) {
      const store = useChatStore.getState();
      if (saved.agents.length > 0) {
        store.setAgents(saved.agents);
      }
      // 恢复对话和消息
      if (saved.conversations.length > 0) {
        useChatStore.setState({
          conversations: saved.conversations,
          messages: saved.messages,
        });
      }
    }

    // 订阅 store 变化，带防抖写入
    const unsub = useChatStore.subscribe(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (state: any) => {
        saveDataDebounced(state.agents, state.conversations, state.messages);
      }
    );

    // 页面关闭 / 刷新前立即保存
    const handleBeforeUnload = () => {
      const state = useChatStore.getState();
      saveDataImmediately(state.agents, state.conversations, state.messages);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsub();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
}
