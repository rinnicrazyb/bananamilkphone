import { CaretLeft } from '@phosphor-icons/react';
import { useSettingsStore } from '../../../store/settings-store';
import { useChatStore } from '../store/chat-store';
import { useNavigate } from 'react-router-dom';

interface Props {
  onBack: () => void;
}

export default function MCPPage({ onBack }: Props) {
  const mcpServers = useSettingsStore((s) => s.mcpServers);
  const navigate = useNavigate();
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const agents = useChatStore((s) => s.agents);
  const updateAgentDisplayConfig = useChatStore((s) => s.updateAgentDisplayConfig);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const currentAgent = agents.find((a) => a.id === activeConv?.agentId);
  const runningServers = mcpServers.filter((s) => s.enabled && s.status === 'connected');
  const enabledIds = currentAgent?.displayConfig?.enabledMCPServerIds ?? [];

  const toggleServer = (serverId: string, enabled: boolean) => {
    if (!currentAgent) return;
    const newIds = enabled
      ? [...enabledIds, serverId]
      : enabledIds.filter((id) => id !== serverId);
    updateAgentDisplayConfig(currentAgent.id, { enabledMCPServerIds: newIds });
  };

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <button className="back-btn" onClick={onBack}><CaretLeft size={18} /></button>
        <h1>MCP 配置</h1>
      </div>

      <div className="settings-page__body">
        <p className="settings-section__desc">为当前智能体启用或禁用已连接的 MCP 服务器。</p>

        {runningServers.length === 0 ? (
          <div className="settings-empty">
            <p className="settings-empty__text">暂无已连接的 MCP 服务器</p>
            <p className="settings-empty__hint">请先在「设置」APP 中配置并启动 MCP 服务器</p>
            <button className="theme-btn" style={{ marginTop: 16 }} onClick={() => navigate('/settings')}>
              去设置 APP 配置
            </button>
          </div>
        ) : (
          <div className="settings-cards">
            {runningServers.map((server) => {
              const isServerEnabled = enabledIds.includes(server.id);
              return (
                <div key={server.id} className="mcp-card">
                  <div className="mcp-card__header">
                    <div className="mcp-card__title-row">
                      <span className="mcp-status-dot" style={{ backgroundColor: '#27ae60' }} />
                      <span className="mcp-card__name">{server.name}</span>
                      <span className="mcp-card__protocol">
                        {server.protocol === 'sse' ? 'SSE' : 'HTTP'}
                      </span>
                    </div>
                    <label
                      className={`settings-toggle${isServerEnabled ? ' settings-toggle--on' : ''}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isServerEnabled}
                        onChange={() => toggleServer(server.id, !isServerEnabled)}
                        className="settings-toggle__input"
                      />
                      <span className="settings-toggle__slider" />
                    </label>
                  </div>
                  <div className="mcp-card__url" title={server.url}>{server.url}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="settings-page__footer">
        <button className="theme-btn" onClick={onBack}>确认</button>
        <button className="theme-btn theme-btn--cancel" onClick={onBack}>取消</button>
      </div>
    </div>
  );
}
