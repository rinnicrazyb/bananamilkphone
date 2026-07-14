import { create } from 'zustand';
import type { Agent, Conversation, Message } from '../types';

interface ChatState {
  agents: Agent[];
  conversations: Conversation[];
  messages: Record<string, Message[]>; // conversationId → messages
  activeConversationId: string | null;

  // Actions
  setAgents: (agents: Agent[]) => void;
  addConversation: (conv: Conversation) => void;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, msg: Message) => void;
  updateMessageStatus: (msgId: string, status: Message['status']) => void;
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

  setAgents: (agents) => set({ agents }),

  addConversation: (conv) =>
    set((state) => ({
      conversations: [conv, ...state.conversations],
    })),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  addMessage: (conversationId, msg) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [
          ...(state.messages[conversationId] || []),
          msg,
        ],
      },
    })),

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
}));
