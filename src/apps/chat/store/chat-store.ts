import { create } from 'zustand';
import type { Agent, AgentSettings, Conversation, Message } from '../types';

interface ChatState {
  agents: Agent[];
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  activeConversationId: string | null;
  showConversationList: boolean;
  searchQuery: string;
  showAgentSettings: boolean;

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
  updateAgentSettings: (agentId: string, settings: Partial<AgentSettings>) => void;
  updateAgent: (agentId: string, data: Partial<Pick<Agent, 'name' | 'avatar'>>) => void;
  setShowAgentSettings: (show: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  agents: [],
  conversations: [],
  messages: {},
  activeConversationId: null,
  showConversationList: false,
  searchQuery: '',
  showAgentSettings: false,

  setAgents: (agents) => set({ agents }),

  addConversation: (conv) =>
    set((state) => ({
      conversations: [conv, ...state.conversations],
    })),

  setActiveConversation: (id) =>
    set({ activeConversationId: id, showConversationList: false }),

  addMessage: (conversationId, msg) =>
    set((state) => {
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

  updateAgentSettings: (agentId, settings) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId
          ? { ...a, settings: { ...a.settings, ...settings } }
          : a
      ),
    })),

  updateAgent: (agentId, data) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, ...data } : a
      ),
    })),

  setShowAgentSettings: (show) => set({ showAgentSettings: show }),
}));
