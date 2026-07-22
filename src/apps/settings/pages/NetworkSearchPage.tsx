import { useState } from 'react';
import { CaretLeft, Eye, EyeClosed } from '@phosphor-icons/react';
import { useSettingsStore } from '../../../store/settings-store';
import type { SearchProviders } from '../types';

interface Props {
  onBack: () => void;
}

type ProviderKey = keyof SearchProviders;

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  tavily: 'Tavily',
  firecrawl: 'Firecrawl',
  tinyfish: 'Tinyfish',
};

const PROVIDER_PLACEHOLDERS: Record<ProviderKey, string> = {
  tavily: 'tvly-...',
  firecrawl: 'fc-...',
  tinyfish: 'tf-...',
};

function SearchProviderBlock({ provider }: { provider: ProviderKey }) {
  const config = useSettingsStore((s) => s.searchProviders[provider]);
  const updateSearchProvider = useSettingsStore((s) => s.updateSearchProvider);
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="settings-card">
      <h3 className="settings-card__title">{PROVIDER_LABELS[provider]}</h3>

      <label className="settings-field">
        <span>API Key</span>
        <div className="settings-field__row">
          <input
            type={showKey ? 'text' : 'password'}
            placeholder={PROVIDER_PLACEHOLDERS[provider]}
            value={config.apiKey}
            onChange={(e) => updateSearchProvider(provider, { apiKey: e.target.value })}
          />
          <button
            className="settings-btn-icon"
            onClick={() => setShowKey(!showKey)}
            title={showKey ? '隐藏' : '显示'}
          >
            {showKey ? <EyeClosed size={20} /> : <Eye size={20} />}
          </button>
        </div>
      </label>

      <label className="settings-field">
        <span>每次搜索最多返回 ({config.maxResults} 条)</span>
        <input
          type="range"
          min="1"
          max="50"
          step="1"
          value={config.maxResults}
          onChange={(e) =>
            updateSearchProvider(provider, {
              maxResults: parseInt(e.target.value, 10),
            })
          }
        />
        <div className="settings-field__hint-row">
          <span className="settings-field__hint">1</span>
          <span className="settings-field__hint">50</span>
        </div>
      </label>
    </div>
  );
}

export default function NetworkSearchPage({ onBack }: Props) {
  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <button className="back-btn" onClick={onBack}>
          <CaretLeft size={18} />
        </button>
        <h1>网络搜索配置</h1>
      </div>

      <div className="settings-page__body">
        <p className="settings-section__desc">
          配置网络搜索供应商的 API Key 和搜索结果数量限制。
          配置完成后可在聊天功能盒中按智能体启用。
        </p>
        <div className="settings-cards">
          {(['tavily', 'firecrawl', 'tinyfish'] as ProviderKey[]).map((p) => (
            <SearchProviderBlock key={p} provider={p} />
          ))}
        </div>
      </div>

      <div className="settings-page__footer">
        <button className="theme-btn" onClick={onBack}>
          确认
        </button>
        <button className="theme-btn theme-btn--cancel" onClick={onBack}>
          取消
        </button>
      </div>
    </div>
  );
}
