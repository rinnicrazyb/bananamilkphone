import { useState, useCallback } from 'react';
import { CaretLeft, Eye, EyeClosed, Spinner, DownloadSimple } from '@phosphor-icons/react';
import { useSettingsStore } from '../../../store/settings-store';
import type { LLMPreset } from '../types';

interface Props {
  onBack: () => void;
}

export default function ApiSettings({ onBack }: Props) {
  const llmConfig = useSettingsStore((s) => s.llmConfig);
  const updateLLMConfig = useSettingsStore((s) => s.updateLLMConfig);
  const llmPresets = useSettingsStore((s) => s.llmPresets);
  const addPreset = useSettingsStore((s) => s.addPreset);
  const updatePreset = useSettingsStore((s) => s.updatePreset);
  const removePreset = useSettingsStore((s) => s.removePreset);
  const [showKey, setShowKey] = useState(false);
  const [presetName, setPresetName] = useState('');

  // — 拉取模型列表 —
  const [models, setModels] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const handleFetchModels = useCallback(async () => {
    if (!llmConfig.baseUrl || !llmConfig.apiKey) {
      setFetchError('请先填写 API 地址和 API Key');
      return;
    }
    setFetching(true);
    setFetchError('');
    setModels([]);
    try {
      const base = llmConfig.baseUrl.replace(/\/+$/, '');
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${llmConfig.apiKey}` },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      const list: string[] = (data.data || []).map((m: { id: string }) => m.id);
      if (list.length === 0) {
        setFetchError('接口返回的模型列表为空');
      } else {
        setModels(list);
      }
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setFetching(false);
    }
  }, [llmConfig.baseUrl, llmConfig.apiKey]);

  // — API 预设 —
  const handleSavePreset = useCallback(() => {
    if (!presetName.trim()) return;
    const preset: LLMPreset = {
      id: crypto.randomUUID(),
      name: presetName.trim(),
      baseUrl: llmConfig.baseUrl,
      apiKey: llmConfig.apiKey,
      model: llmConfig.model,
      temperature: llmConfig.temperature,
      topP: llmConfig.topP,
    };
    addPreset(preset);
    setPresetName('');
  }, [presetName, llmConfig, addPreset]);

  const applyPreset = useCallback((preset: LLMPreset) => {
    updateLLMConfig({
      baseUrl: preset.baseUrl,
      apiKey: preset.apiKey,
      model: preset.model,
      temperature: preset.temperature,
      topP: preset.topP,
    });
  }, [updateLLMConfig]);

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <button className="back-btn" onClick={onBack}>
          <CaretLeft size={18} /> 返回
        </button>
        <h1>API 设置</h1>
      </div>

      <div className="settings-page__body">
        <div className="settings-section">
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
                {showKey ? <EyeClosed size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </label>

          <label className="settings-field">
            <span>模型</span>
            <div className="settings-field__row">
              <input
                type="text"
                placeholder="gpt-4o / deepseek-chat"
                value={llmConfig.model}
                onChange={(e) => updateLLMConfig({ model: e.target.value })}
                list="model-suggestions"
              />
              <button
                className="settings-btn-icon"
                onClick={handleFetchModels}
                disabled={fetching}
                title="拉取模型列表"
              >
                {fetching ? <Spinner size={18} className="spin" /> : <DownloadSimple size={18} />}
              </button>
            </div>
            {/* model datalist 建议 */}
            {models.length > 0 && (
              <datalist id="model-suggestions">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            )}
            {fetchError && (
              <span className="settings-field__hint settings-field__hint--error">
                {fetchError}
              </span>
            )}
            {models.length > 0 && !fetchError && (
              <span className="settings-field__hint settings-field__hint--ok">
                已拉取 {models.length} 个模型，键入时自动建议
              </span>
            )}
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

        {/* ─── API 预设 ─── */}
        <div className="settings-section">
          <h2>API 预设</h2>
          <p className="settings-section__desc">保存当前配置为预设，方便快速切换。</p>

          {/* 保存新预设 */}
          <div className="settings-field__row">
            <input
              type="text"
              placeholder="预设名称"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="theme-btn" onClick={handleSavePreset} disabled={!presetName.trim()}>
              保存为预设
            </button>
          </div>

          {/* 预设列表 */}
          {llmPresets.length === 0 ? (
            <p className="settings-field__hint" style={{ marginTop: 8 }}>暂无预设</p>
          ) : (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {llmPresets.map((p) => (
                <div key={p.id} className="settings-card" style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                        {p.model} · {p.baseUrl.replace(/^https?:\/\//, '').slice(0, 30)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="mcp-card__btn" onClick={() => applyPreset(p)}>应用</button>
                      <button className="mcp-card__btn" onClick={() => {
                        const name = prompt('修改预设名称', p.name);
                        if (name) updatePreset(p.id, { name });
                      }}>修改</button>
                      <button className="mcp-card__btn mcp-card__btn--danger" onClick={() => removePreset(p.id)}>删除</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
