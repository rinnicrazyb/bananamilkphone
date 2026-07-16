import { useChatStore } from '../store/chat-store';
import { CaretLeft } from '@phosphor-icons/react';
import type { Agent } from '../types';
import { DEFAULT_DISPLAY_CONFIG } from '../types';
import AgentAvatar from '../components/AgentAvatar';

function formatLastContact(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AgentList() {
  const agents = useChatStore((s) => s.agents);
  const conversations = useChatStore((s) => s.conversations);
  const addAgent = useChatStore((s) => s.addAgent);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const addConversation = useChatStore((s) => s.addConversation);
  const updateAgentLastContact = useChatStore((s) => s.updateAgentLastContact);

  const openOrCreateConversation = (agentId: string) => {
    updateAgentLastContact(agentId, Date.now());
    // 查找该智能体下已有对话，按更新时间排序，取最新的
    const existing = conversations
      .filter((c) => c.agentId === agentId)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    if (existing.length > 0) {
      // 有已有对话 → 打开最近的一个
      setActiveConversation(existing[0].id);
    } else {
      // 无对话 → 创建一个新的
      const conv = {
        id: `conv-${Date.now()}`,
        agentId,
        title: '新对话',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      addConversation(conv);
      setActiveConversation(conv.id);
    }
  };

  const handleAddAgent = () => {
    const newAgent: Agent = {
      id: `agent-${Date.now()}`,
      name: '新智能体',
      avatar: '🤖',
      unreadCount: 0,
      displayConfig: { ...DEFAULT_DISPLAY_CONFIG },
      settings: {
        systemPrompt: '你是AI助手，一个友好的智能聊天伙伴。',
        model: '',
        temperature: undefined,
        topP: undefined,
      },
    };
    addAgent(newAgent);
  };

  return (
    <div className="chat-agent-list">
      <div className="chat-agent-list__header">
        <button className="back-btn" onClick={() => window.history.back()}>
          <CaretLeft size={18} /> 返回
        </button>
        <h1>聊天</h1>
        {agents.length > 0 && (
          <button className="chat-agent-list__add-btn" onClick={handleAddAgent}>
            ＋
          </button>
        )}
      </div>

      <div className="chat-agent-list__body">
        {agents.length === 0 ? (
          <div className="chat-agent-list__empty">
            <p>暂无智能体</p>
            <p className="chat-agent-list__empty-hint">
              点击下方按钮添加第一个智能体
            </p>
            <button className="chat-agent-list__add-btn-large" onClick={handleAddAgent}>
              ＋ 添加智能体
            </button>
          </div>
        ) : (
          agents.map((agent) => {
            return (
              <div
                key={agent.id}
                className="chat-agent-item"
                onClick={() => openOrCreateConversation(agent.id)}
              >
                <AgentAvatar
                  avatar={agent.avatar}
                  className="chat-agent-item__avatar"
                >
                  {agent.unreadCount > 0 && (
                    <span className="chat-agent-item__badge">
                      {agent.unreadCount > 99 ? '99+' : agent.unreadCount}
                    </span>
                  )}
                </AgentAvatar>
                <div className="chat-agent-item__info">
                  <span className="chat-agent-item__name">{agent.name}</span>
                  <span className="chat-agent-item__time">
                    {agent.lastContactTime ? formatLastContact(agent.lastContactTime) : ''}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
