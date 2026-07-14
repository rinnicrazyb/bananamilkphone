import { useChatStore } from '../store/chat-store';

export default function AgentSettingsPanel() {
  const agents = useChatStore((s) => s.agents);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const updateAgentSettings = useChatStore((s) => s.updateAgentSettings);
  const updateAgent = useChatStore((s) => s.updateAgent);
  const setShowAgentSettings = useChatStore((s) => s.setShowAgentSettings);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const agent = agents.find((a) => a.id === activeConv?.agentId) || agents[0];

  if (!agent) return null;

  return (
    <div className="agent-settings-overlay" onClick={() => setShowAgentSettings(false)}>
      <div className="agent-settings" onClick={(e) => e.stopPropagation()}>
        <div className="agent-settings__header">
          <h2>智能体设定</h2>
          <button
            className="agent-settings__close"
            onClick={() => setShowAgentSettings(false)}
          >
            ✕
          </button>
        </div>

        <div className="agent-settings__body">
          <label className="settings-field">
            <span>名称</span>
            <input
              type="text"
              value={agent.name}
              onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
            />
          </label>

          <label className="settings-field">
            <span>头像</span>
            <input
              type="text"
              value={agent.avatar}
              onChange={(e) => updateAgent(agent.id, { avatar: e.target.value })}
              placeholder="🥛（输入 emoji 或 URL）"
            />
          </label>

          <label className="settings-field">
            <span>系统提示词</span>
            <textarea
              className="settings-textarea"
              rows={6}
              value={agent.settings.systemPrompt}
              onChange={(e) =>
                updateAgentSettings(agent.id, { systemPrompt: e.target.value })
              }
              placeholder="AI 的角色设定..."
            />
          </label>

          <label className="settings-field">
            <span>模型（留空则使用全局设置）</span>
            <input
              type="text"
              value={agent.settings.model || ''}
              onChange={(e) =>
                updateAgentSettings(agent.id, { model: e.target.value })
              }
              placeholder="gpt-4o / deepseek-chat"
            />
          </label>

          <label className="settings-field">
            <span>Temperature ({agent.settings.temperature ?? '全局'})</span>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={agent.settings.temperature ?? 0.7}
              onChange={(e) =>
                updateAgentSettings(agent.id, {
                  temperature: parseFloat(e.target.value),
                })
              }
            />
          </label>

          <label className="settings-field">
            <span>Top P ({agent.settings.topP ?? '全局'})</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={agent.settings.topP ?? 1}
              onChange={(e) =>
                updateAgentSettings(agent.id, { topP: parseFloat(e.target.value) })
              }
            />
          </label>
        </div>

        <div className="agent-settings__footer">
          <button
            className="theme-btn"
            onClick={() => setShowAgentSettings(false)}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
