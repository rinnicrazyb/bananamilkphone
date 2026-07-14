import { useChatStore } from '../store/chat-store';

export default function AgentList() {
  const agents = useChatStore((s) => s.agents);
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

  return (
    <div className="chat-agent-list">
      <div className="chat-agent-list__header">
        <button className="back-btn" onClick={() => window.history.back()}>
          ← 返回
        </button>
        <h1>聊天</h1>
      </div>

      <div className="chat-agent-list__body">
        {agents.length === 0 ? (
          <div className="chat-agent-list__empty">
            <p>暂无智能体</p>
            <p className="chat-agent-list__empty-hint">
              请在智能体设定中添加
            </p>
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
