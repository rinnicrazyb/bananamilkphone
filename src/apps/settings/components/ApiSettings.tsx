import { useState } from 'react';
import { useSettingsStore } from '../../../store/settings-store';

export default function ApiSettings() {
  const llmConfig = useSettingsStore((s) => s.llmConfig);
  const updateLLMConfig = useSettingsStore((s) => s.updateLLMConfig);
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="settings-section">
      <h2>LLM API 设置</h2>
      <p className="settings-section__desc">
        API Key 使用 Web Crypto API 加密后存储在本地，不会明文保存
      </p>

      <label className="settings-field">
        <span>API 地址</span>
        <input
          type="url"
          placeholder="https://api.openai.com/v1"
          value={llmConfig.baseUrl}
          onChange={(e) => updateLLMConfig({ baseUrl: e.target.value })}
        />
      </label>

      <label className="settings-field">
        <span>API Key</span>
        <div className="settings-field__row">
          <input
            type={showKey ? 'text' : 'password'}
            placeholder="sk-..."
            value={llmConfig.apiKey}
            onChange={(e) => updateLLMConfig({ apiKey: e.target.value })}
          />
          <button
            className="settings-btn-icon"
            onClick={() => setShowKey(!showKey)}
            title={showKey ? '隐藏' : '显示'}
          >
            {showKey ? '🙈' : '👁️'}
          </button>
        </div>
      </label>

      <label className="settings-field">
        <span>模型</span>
        <input
          type="text"
          placeholder="gpt-4o / deepseek-chat"
          value={llmConfig.model}
          onChange={(e) => updateLLMConfig({ model: e.target.value })}
        />
      </label>

      <label className="settings-field">
        <span>Temperature ({llmConfig.temperature})</span>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={llmConfig.temperature}
          onChange={(e) =>
            updateLLMConfig({ temperature: parseFloat(e.target.value) })
          }
        />
      </label>

      <label className="settings-field">
        <span>Top P ({llmConfig.topP})</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={llmConfig.topP}
          onChange={(e) =>
            updateLLMConfig({ topP: parseFloat(e.target.value) })
          }
        />
      </label>
    </div>
  );
}
