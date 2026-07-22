import { useEffect } from 'react';
import { useAppStore } from '../../store/app-store';
import { useChatStore } from '../../apps/chat/store/chat-store';
import { useLorebookStore } from '../../apps/lorebook/store/lorebook-store';
import { loadData, saveDataDebounced, saveDataImmediately } from './index';
import { insertMessages, migrateFromBlob, hasMessageData } from '../chat-message-db';
import { messagesToNodes, getCurrentMessages, getAllMessages } from '../message-nodes/index';
import type { Message } from '../../apps/chat/types';

/**
 * 数据持久化 Hook —— 在应用根组件中使用一次
 * 从 SQLite 加载 messageNodes 注入 Zustand，并订阅变化写入
 */
export function usePersistence() {
  useEffect(() => {
    loadData().then((persisted) => {
      if (!persisted) return;
      const state = useChatStore.getState();

      // 旧版 messages → messageNodes 迁移
      if (persisted.messageNodes && Object.keys(persisted.messageNodes).length > 0) {
        // 新格式：直接使用 messageNodes
        useChatStore.setState({ messageNodes: persisted.messageNodes });

        // ----------------------------------------------------------------
        // 根治：同步 messages 兼容字段 + 补齐 messages 表
        // ----------------------------------------------------------------
        // 1) 同步 messages 兼容字段（loadInitialWindow / ContextPreviewPage 依赖此字段）
        const syncedMsgs: Record<string, Message[]> = {};
        for (const [cid, ns] of Object.entries(persisted.messageNodes)) {
          syncedMsgs[cid] = getCurrentMessages(ns);
        }
        useChatStore.setState({ messages: syncedMsgs });

        // 2) 补齐 SQLite messages 表（旧数据可能未经过双写，搜索/DB 查询会漏）
        hasMessageData().then((exists) => {
          if (!exists) {
            const allMsgs: Message[] = [];
            for (const ns of Object.values(persisted.messageNodes!)) {
              allMsgs.push(...getAllMessages(ns));
            }
            if (allMsgs.length > 0) insertMessages(allMsgs).catch(() => {});
          }
        });
      } else if (persisted.messages && Object.keys(persisted.messages).length > 0) {
        // 旧格式：消息写 messages 表，转换 messageNodes
        hasMessageData().then(exists => {
          if (!exists) migrateFromBlob({ messages: persisted.messages as any });
        });
        // 转换 flat messages → MessageNode[]
        const converted: Record<string, import('../../apps/chat/types').MessageNode[]> = {};
        for (const [convId, msgs] of Object.entries(persisted.messages)) {
          if (msgs && msgs.length > 0) {
            converted[convId] = messagesToNodes(msgs as any[]);
          }
        }
        if (Object.keys(converted).length > 0) {
          useChatStore.setState({ messageNodes: converted });
          // 同步 messages 兼容字段
          const syncedLegacy: Record<string, Message[]> = {};
          for (const [cid, ns] of Object.entries(converted)) {
            syncedLegacy[cid] = getCurrentMessages(ns);
          }
          useChatStore.setState({ messages: syncedLegacy });
        }
      }

      state.setAgents(persisted.agents || []);
      if (persisted.conversations?.length) {
        useChatStore.setState({ conversations: persisted.conversations });
      }

      useChatStore.setState({ memories: persisted.memories || {} });

      if (persisted.lorebooks?.length) {
        useLorebookStore.getState().setLorebooks(persisted.lorebooks);
      }
      if (persisted.desktopGrid?.length) {
        useAppStore.setState({ desktopGrid: persisted.desktopGrid });
      }
    }).catch((err) => {
      console.warn('[usePersistence] Load failed:', err);
    });

    // 订阅 store 变化，保存 messageNodes
    const unsubChat = useChatStore.subscribe(
      () => {
        const chatState = useChatStore.getState();
        const lorebookState = useLorebookStore.getState();
        const appState = useAppStore.getState();
        saveDataDebounced(
          chatState.agents, chatState.conversations,
          chatState.memories, lorebookState.lorebooks,
          appState.desktopGrid, chatState.messageNodes
        );
      }
    );

    const unsubLorebook = useLorebookStore.subscribe(
      () => {
        const chatState = useChatStore.getState();
        const ls = useLorebookStore.getState();
        const appState = useAppStore.getState();
        saveDataDebounced(
          chatState.agents, chatState.conversations,
          chatState.memories, ls.lorebooks,
          appState.desktopGrid, chatState.messageNodes
        );
      }
    );

    const unsubApp = useAppStore.subscribe(
      () => {
        const chatState = useChatStore.getState();
        const ls = useLorebookStore.getState();
        const as = useAppStore.getState();
        saveDataDebounced(
          chatState.agents, chatState.conversations,
          chatState.memories, ls.lorebooks,
          as.desktopGrid, chatState.messageNodes
        );
      }
    );

    const handleBeforeUnload = () => {
      const chatState = useChatStore.getState();
      const lorebookState = useLorebookStore.getState();
      const appState = useAppStore.getState();
      saveDataImmediately(
        chatState.agents, chatState.conversations,
        chatState.memories, lorebookState.lorebooks,
        appState.desktopGrid, chatState.messageNodes
      );
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
