import { useChatStore } from '../store/chat-store';
import type { Agent } from '../types';

export default function AgentList() {
  const agents = useChatStore((s) => s.agents);
  const addAgent = useChatStore((s) => s.addAgent);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const addConversation = useChatStore((s) => s.addConversation);

  const startNewConversation = (agentId: string) => {
    const conv = {
      id: `conv-${Date.now()}`,
      agentId,
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    addConversation(conv);
    setActiveConversation(conv.id);
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
          agents.map((agent) => (
            <div
              key={agent.id}
              className="chat-agent-item"
              onClick={() => startNewConversation(agent.id)}
            >
              <div className="chat-agent-item__avatar">
                <span>{agent.avatar}</span>
                {agent.unreadCount > 0 && (
                  <span className="chat-agent-item__badge">
                    {agent.unreadCount > 99 ? '99+' : agent.unreadCount}
                  </span>
                )}
              </div>
              <div className="chat-agent-item__info">
                <span className="chat-agent-item__name">{agent.name}</span>
                {agent.lastContactTime && (
                  <span className="chat-agent-item__time">
                    {new Date(agent.lastContactTime).toLocaleDateString('zh-CN')}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
