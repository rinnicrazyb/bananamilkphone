import { create } from 'zustand';
import type { Agent, Conversation, Message } from '../types';

interface ChatState {
  agents: Agent[];
  conversations: Conversation[];
  messages: Record<string, Message[]>; // conversationId → messages
  activeConversationId: string | null;
  showConversationList: boolean; // 对话列表面板
  searchQuery: string; // 全局搜索

  // Actions
  setAgents: (agents: Agent[]) => void;
  addConversation: (conv: Conversation) => void;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, msg: Message) => void;
  updateMessageStatus: (msgId: string, status: Message['status']) => void;
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  toggleConversationList: () => void;
  setSearchQuery: (query: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  agents: [
    {
      id: 'default-agent',
      name: '香蕉牛奶',
      avatar: '🥛',
      unreadCount: 0,
    },
  ],
  conversations: [],
  messages: {},
  activeConversationId: null,
  showConversationList: false,
  searchQuery: '',

  setAgents: (agents) => set({ agents }),

  addConversation: (conv) =>
    set((state) => ({
      conversations: [conv, ...state.conversations],
    })),

  setActiveConversation: (id) =>
    set({ activeConversationId: id, showConversationList: false }),

  addMessage: (conversationId, msg) =>
    set((state) => {
      // 同时更新对话的更新时间
      const conversations = state.conversations.map((c) =>
        c.id === conversationId ? { ...c, updatedAt: Date.now() } : c
      );
      return {
        conversations,
        messages: {
          ...state.messages,
          [conversationId]: [
            ...(state.messages[conversationId] || []),
            msg,
          ],
        },
      };
    }),

  updateMessageStatus: (msgId, status) =>
    set((state) => {
      const newMessages = { ...state.messages };
      for (const convId of Object.keys(newMessages)) {
        newMessages[convId] = newMessages[convId].map((m) =>
          m.id === msgId ? { ...m, status } : m
        );
      }
      return { messages: newMessages };
    }),

  renameConversation: (id, title) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    })),

  deleteConversation: (id) =>
    set((state) => {
      const { [id]: _, ...remaining } = state.messages;
      return {
        conversations: state.conversations.filter((c) => c.id !== id),
        messages: remaining,
        activeConversationId:
          state.activeConversationId === id ? null : state.activeConversationId,
      };
    }),

  toggleConversationList: () =>
    set((state) => ({
      showConversationList: !state.showConversationList,
    })),

  setSearchQuery: (query) => set({ searchQuery: query }),
}));
