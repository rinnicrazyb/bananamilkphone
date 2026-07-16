import { CaretLeft } from '@phosphor-icons/react';
import { useSettingsStore } from '../../../store/settings-store';
import { useChatStore } from '../store/chat-store';
import { useNavigate } from 'react-router-dom';

interface Props {
  onBack: () => void;
}

type SearchProviderKey = 'tavily' | 'firecrawl' | 'tinyfish';

const PROVIDER_LABELS: Record<SearchProviderKey, string> = {
  tavily: 'Tavily',
  firecrawl: 'Firecrawl',
  tinyfish: 'Tinyfish',
};

export default function WebSearchPage({ onBack }: Props) {
  const searchProviders = useSettingsStore((s) => s.searchProviders);
  const navigate = useNavigate();
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const agents = useChatStore((s) => s.agents);
  const updateAgentDisplayConfig = useChatStore((s) => s.updateAgentDisplayConfig);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const currentAgent = agents.find((a) => a.id === activeConv?.agentId);
  const enabledProviders = currentAgent?.displayConfig?.enabledSearchProviders ?? [];

  const configuredProviders = (Object.keys(searchProviders) as SearchProviderKey[]).filter(
    (k) => searchProviders[k].apiKey.trim().length > 0
  );

  const toggleProvider = (key: SearchProviderKey, enable: boolean) => {
    if (!currentAgent) return;
    const newList = enable
      ? [...enabledProviders, key]
      : enabledProviders.filter((p) => p !== key);
    updateAgentDisplayConfig(currentAgent.id, { enabledSearchProviders: newList });
  };

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <button className="back-btn" onClick={onBack}><CaretLeft size={18} /> 返回</button>
        <h1>网络搜索</h1>
      </div>

      <div className="settings-page__body">
        <p className="settings-section__desc">为当前智能体选择要启用的搜索供应商。</p>

        {configuredProviders.length === 0 ? (
          <div className="settings-empty">
            <p className="settings-empty__text">暂未配置搜索供应商</p>
            <p className="settings-empty__hint">请先在「设置」APP 中配置 API Key</p>
            <button className="theme-btn" style={{ marginTop: 16 }} onClick={() => navigate('/settings')}>
              去设置 APP 配置
            </button>
          </div>
        ) : (
          <div className="settings-cards">
            {configuredProviders.map((key) => {
              const isOn = enabledProviders.includes(key);
              return (
                <div key={key} className="mcp-card">
                  <div className="mcp-card__header">
                    <div className="mcp-card__title-row">
                      <span className="mcp-card__name">{PROVIDER_LABELS[key]}</span>
                      <span className="mcp-card__protocol">最多 {searchProviders[key].maxResults} 条</span>
                    </div>
                    <label
                      className={`settings-toggle${isOn ? ' settings-toggle--on' : ''}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={() => toggleProvider(key, !isOn)}
                        className="settings-toggle__input"
                      />
                      <span className="settings-toggle__slider" />
                    </label>
                  </div>
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
