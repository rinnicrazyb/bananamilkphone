import { useEffect } from 'react';
import { useChatStore } from '../../apps/chat/store/chat-store';
import { clearData, saveDataDebounced, saveDataImmediately } from './index';

/**
 * 数据持久化 Hook —— 在应用根组件中使用一次
 * 自动加载已保存的数据，并订阅 store 变化带防抖写入
 */
export function usePersistence() {
  useEffect(() => {
    // 清除旧缓存（升级后旧数据会干扰）
    clearData();

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
