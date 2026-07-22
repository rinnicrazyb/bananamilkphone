import { create } from 'zustand';
import type { Agent, AgentSettings, AgentDisplayConfig, Conversation, Message, Memory, MessageNode } from '../types';
import { DEFAULT_DISPLAY_CONFIG } from '../types';
import { insertMessage as dbInsertMessage, updateMessage as dbUpdateMessage } from '../../../services/chat-message-db';
import { getCurrentMessages, addNode, addBranchMessage } from '../../../services/message-nodes/index';

function syncMsgs(mn: Record<string, MessageNode[]>): Record<string, Message[]> {
  const r: Record<string, Message[]> = {};
  for (const [k, v] of Object.entries(mn)) r[k] = getCurrentMessages(v);
  return r;
}
function withMsgs(mn: Record<string, MessageNode[]>, convId: string, nodes: MessageNode[]) {
  const full = { ...mn, [convId]: nodes };
  return { messageNodes: full, messages: syncMsgs(full) };
}

interface ChatState {
  agents: Agent[];
  conversations: Conversation[];
  messageNodes: Record<string, MessageNode[]>;
  messages: Record<string, Message[]>;
  activeConversationId: string | null;
  showConversationList: boolean;
  searchQuery: string;
  showAgentSettings: boolean;
  thinkingChainCollapsed: boolean;
  memories: Record<string, Memory[]>;

  getCurrentMessages: (conversationId: string) => Message[];
  getAllMessages: (conversationId: string) => Message[];

  setAgents: (agents: Agent[]) => void;
  addAgent: (agent: Agent) => void;
  addConversation: (conv: Conversation) => void;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, msg: Message) => void;
  updateMessageStatus: (msgId: string, status: Message['status']) => void;
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  toggleConversationList: () => void;
  setSearchQuery: (query: string) => void;
  updateAgentSettings: (agentId: string, settings: Partial<AgentSettings>) => void;
  updateAgent: (agentId: string, data: Partial<Pick<Agent, 'name' | 'avatar' | 'lastContactTime'>>) => void;
  updateAgentLastContact: (agentId: string, timestamp: number) => void;
  updateAgentDisplayConfig: (agentId: string, config: Partial<AgentDisplayConfig>) => void;
  setShowAgentSettings: (show: boolean) => void;
  setThinkingChainCollapsed: (collapsed: boolean) => void;
  setMemories: (agentId: string, memories: Memory[]) => void;
  addMemory: (agentId: string, memory: Memory) => void;
  updateMemory: (agentId: string, memoryId: string, content: string) => void;
  deleteMemory: (agentId: string, memoryId: string) => void;
  addMemories: (agentId: string, memories: Memory[], conversationId: string, messageIds: string[]) => void;
  markMessagesExtracted: (conversationId: string, messageIds: string[]) => void;
  setMessageNodes: (conversationId: string, nodes: MessageNode[]) => void;
  selectBranch: (conversationId: string, nodeId: string, newIndex: number) => void;
  editMessageContent: (conversationId: string, msgId: string, newContent: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  agents: [],
  conversations: [],
  messageNodes: {},
  messages: {},
  activeConversationId: null,
  showConversationList: false,
  searchQuery: '',
  showAgentSettings: false,
  thinkingChainCollapsed: true,
  memories: {},

  getCurrentMessages: (convId) => getCurrentMessages(get().messageNodes[convId] || []),
  getAllMessages: (convId) => (get().messageNodes[convId] || []).flatMap(n => n.messages),

  setMessageNodes: (convId, nodes) =>
    set((s) => withMsgs(s.messageNodes, convId, nodes)),

  setAgents: (agents) => set({ agents }),
  addAgent: (agent) => set((s) => ({ agents: [...s.agents, agent] })),

  addConversation: (conv) =>
    set((s) => ({ conversations: [conv, ...s.conversations] })),

  setActiveConversation: (id) =>
    set({ activeConversationId: id, showConversationList: false }),

  addMessage: (convId, msg) =>
    set((s) => {
      const convs = s.conversations.map(c => c.id === convId ? { ...c, updatedAt: Date.now() } : c);
      dbInsertMessage(msg).catch(e => console.warn('[chat-store] DB insert failed:', e));
      const nodes = s.messageNodes[convId] || [];
      const last = nodes[nodes.length - 1];
      const sameRole = last && !msg.nodeId && last.role === msg.role && msg.role !== 'tool';
      let newNodes: MessageNode[];
      if (sameRole) {
        newNodes = addBranchMessage(nodes, last.id, { ...msg, nodeId: last.id });
      } else {
        newNodes = addNode(nodes, { ...msg, nodeId: msg.nodeId || `node-${msg.id}` });
      }
      return { conversations: convs, ...withMsgs(s.messageNodes, convId, newNodes) };
    }),

  updateMessageStatus: (msgId, status) =>
    set((s) => {
      const mn: Record<string, MessageNode[]> = {};
      for (const [k, v] of Object.entries(s.messageNodes)) {
        mn[k] = v.map(n => ({ ...n, messages: n.messages.map(m => m.id === msgId ? { ...m, status } : m) }));
      }
      dbUpdateMessage(msgId, { status }).catch(() => {});
      return { messageNodes: mn, messages: syncMsgs(mn) };
    }),

  renameConversation: (id, title) =>
    set((s) => ({ conversations: s.conversations.map(c => c.id === id ? { ...c, title } : c) })),

  deleteConversation: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.messageNodes;
      return { conversations: s.conversations.filter(c => c.id !== id), messageNodes: rest, messages: syncMsgs(rest), activeConversationId: s.activeConversationId === id ? null : s.activeConversationId };
    }),

  toggleConversationList: () => set((s) => ({ showConversationList: !s.showConversationList })),
  setSearchQuery: (q) => set({ searchQuery: q }),

  updateAgentSettings: (aid, setts) =>
    set((s) => ({ agents: s.agents.map(a => a.id === aid ? { ...a, settings: { ...a.settings, ...setts } } : a) })),

  updateAgent: (aid, data) =>
    set((s) => ({ agents: s.agents.map(a => a.id === aid ? { ...a, ...data } : a) })),

  updateAgentLastContact: (aid, ts) =>
    set((s) => ({ agents: s.agents.map(a => a.id === aid ? { ...a, lastContactTime: ts } : a) })),

  updateAgentDisplayConfig: (aid, cfg) =>
    set((s) => ({
      agents: s.agents.map(a => a.id === aid ? { ...a, displayConfig: { ...DEFAULT_DISPLAY_CONFIG, ...a.displayConfig, ...cfg } } : a),
    })),

  setShowAgentSettings: (v) => set({ showAgentSettings: v }),
  setThinkingChainCollapsed: (v) => set({ thinkingChainCollapsed: v }),

  setMemories: (aid, mems) => set((s) => ({ memories: { ...s.memories, [aid]: mems } })),
  addMemory: (aid, mem) => set((s) => ({ memories: { ...s.memories, [aid]: [...(s.memories[aid] || []), mem] } })),
  updateMemory: (aid, mid, c) =>
    set((s) => ({ memories: { ...s.memories, [aid]: (s.memories[aid] || []).map(m => m.id === mid ? { ...m, content: c, updatedAt: Date.now() } : m) } })),
  deleteMemory: (aid, mid) =>
    set((s) => ({ memories: { ...s.memories, [aid]: (s.memories[aid] || []).filter(m => m.id !== mid) } })),

  addMemories: (aid, mems, convId, mids) =>
    set((s) => ({
      memories: { ...s.memories, [aid]: [...(s.memories[aid] || []), ...mems] },
      ...withMsgs(s.messageNodes, convId, (s.messageNodes[convId] || []).map(n => ({
        ...n, messages: n.messages.map(m => mids.includes(m.id) ? { ...m, memoryExtracted: true } : m)
      }))),
    })),

  markMessagesExtracted: (convId, mids) =>
    set((s) => withMsgs(s.messageNodes, convId, (s.messageNodes[convId] || []).map(n => ({
      ...n, messages: n.messages.map(m => mids.includes(m.id) ? { ...m, memoryExtracted: true } : m)
    })))),

  selectBranch: (convId, nodeId, newIdx) =>
    set((s) => {
      const nodes = s.messageNodes[convId] || [];
      const target = nodes.find(n => n.id === nodeId);
      if (!target) return s;
      const clamped = Math.max(0, Math.min(newIdx, target.messages.length - 1));
      return withMsgs(s.messageNodes, convId, nodes.map(n => n.id === nodeId ? { ...n, selectedIndex: clamped } : n));
    }),

  editMessageContent: (convId, msgId, newContent) =>
    set((s) => {
      let found = false;
      const updated = (s.messageNodes[convId] || []).map(n => {
        const ti = n.messages.findIndex(m => m.id === msgId);
        if (ti < 0) return n;
        found = true;
        return {
          ...n,
          messages: [...n.messages, { ...n.messages[ti], id: `${msgId}-edit-${Date.now()}`, content: newContent, parts: undefined, timestamp: Date.now() }],
          selectedIndex: n.messages.length,
        };
      });
      if (!found) return s;
      return withMsgs(s.messageNodes, convId, updated);
    }),
}));
