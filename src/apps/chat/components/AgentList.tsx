import { useChatStore } from '../store/chat-store';
import type { Agent } from '../types';
import AgentAvatar from '../components/AgentAvatar';

export default function AgentList() {
  const agents = useChatStore((s) => s.agents);
  const conversations = useChatStore((s) => s.conversations);
  const addAgent = useChatStore((s) => s.addAgent);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const addConversation = useChatStore((s) => s.addConversation);

  const openOrCreateConversation = (agentId: string) => {
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
          ← 返回
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
            const convCount = conversations.filter((c) => c.agentId === agent.id).length;
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
                    {convCount > 0 ? `${convCount}个对话` : ''}
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
