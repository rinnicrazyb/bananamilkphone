import { useState, useCallback } from 'react';
import { CaretLeft, Eye, EyeClosed, Spinner, DownloadSimple, FloppyDisk, CheckCircle } from '@phosphor-icons/react';
import { useSettingsStore } from '../../../store/settings-store';
import type { LLMPreset } from '../types';

interface Props {
  onBack: () => void;
}

/** 预设保存弹窗 */
function SavePresetModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>保存为预设</h3>
        <input
          type="text"
          className="modal-input"
          placeholder="请输入预设名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <div className="modal-actions">
          <button className="theme-btn" onClick={() => onConfirm(name.trim())} disabled={!name.trim()}>
            确认
          </button>
          <button className="theme-btn theme-btn--cancel" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

/** 修改预设弹窗 */
function EditPresetModal({
  preset,
  onSave,
  onCancel,
}: {
  preset: LLMPreset;
  onSave: (data: Partial<LLMPreset>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(preset.name);
  const [baseUrl, setBaseUrl] = useState(preset.baseUrl);
  const [apiKey, setApiKey] = useState(preset.apiKey);
  const [model, setModel] = useState(preset.model);
  const [temperature, setTemperature] = useState(preset.temperature);
  const [topP, setTopP] = useState(preset.topP);
  const [ttsProvider, setTtsProvider] = useState(preset.ttsProvider || '');
  const [ttsApiKey, setTtsApiKey] = useState(preset.ttsApiKey || '');
  const [ttsModel, setTtsModel] = useState(preset.ttsModel || '');
  const [ttsVoice, setTtsVoice] = useState(preset.ttsVoice || '');
  const [ocrModel, setOcrModel] = useState(preset.ocrModel || '');
  const [ocrPrompt, setOcrPrompt] = useState(preset.ocrPrompt || '');
  const [showKey, setShowKey] = useState(false);
  const [showTtsKey, setShowTtsKey] = useState(false);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-dialog modal-dialog--wide" onClick={(e) => e.stopPropagation()}>
        <h3>修改预设：{preset.name}</h3>
        <div className="modal-body">
          <label className="settings-field">
            <span>预设名称</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="settings-section">
            <h2>聊天模型</h2>
            <label className="settings-field">
              <span>API 地址</span>
              <input type="url" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </label>
            <label className="settings-field">
              <span>API Key</span>
              <div className="settings-field__row">
                <input type={showKey ? 'text' : 'password'} placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                <button className="settings-btn-icon" onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeClosed size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <label className="settings-field">
              <span>模型</span>
              <input type="text" placeholder="gpt-4o" value={model} onChange={(e) => setModel(e.target.value)} />
            </label>
            <label className="settings-field">
              <span>Temperature ({temperature})</span>
              <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} />
            </label>
            <label className="settings-field">
              <span>Top P ({topP})</span>
              <input type="range" min="0" max="1" step="0.05" value={topP} onChange={(e) => setTopP(parseFloat(e.target.value))} />
            </label>
          </div>

          <div className="settings-section">
            <h2>TTS 语音</h2>
            <label className="settings-field">
              <span>TTS 供应商</span>
              <select className="settings-select" value={ttsProvider} onChange={(e) => setTtsProvider(e.target.value)}>
                <option value="">不使用</option>
                <option value="elevenlabs">ElevenLabs</option>
                <option value="minimax">MiniMax</option>
              </select>
            </label>
            {ttsProvider && (
              <>
                <label className="settings-field">
                  <span>TTS API Key</span>
                  <div className="settings-field__row">
                    <input type={showTtsKey ? 'text' : 'password'} placeholder="TTS Key..." value={ttsApiKey} onChange={(e) => setTtsApiKey(e.target.value)} />
                    <button className="settings-btn-icon" onClick={() => setShowTtsKey(!showTtsKey)}>
                      {showTtsKey ? <EyeClosed size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>
                <label className="settings-field">
                  <span>TTS 模型</span>
                  <input type="text" placeholder={ttsProvider === 'elevenlabs' ? 'eleven_turbo_v2_5' : 'speech-01'} value={ttsModel} onChange={(e) => setTtsModel(e.target.value)} />
                </label>
                <label className="settings-field">
                  <span>语音 ID</span>
                  <input type="text" placeholder="voice id..." value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)} />
                </label>
              </>
            )}
          </div>

          <div className="settings-section">
            <h2>OCR 模型</h2>
            <label className="settings-field">
              <span>OCR 模型</span>
              <input type="text" placeholder="留空使用聊天模型" value={ocrModel} onChange={(e) => setOcrModel(e.target.value)} />
            </label>
            <label className="settings-field">
              <span>OCR 提示词</span>
              <textarea className="settings-textarea" rows={3} placeholder="自定义 OCR 提示词（可选）" value={ocrPrompt} onChange={(e) => setOcrPrompt(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="modal-actions">
          <button className="theme-btn" onClick={() => onSave({ name, baseUrl, apiKey, model, temperature, topP, ttsProvider, ttsApiKey, ttsModel, ttsVoice, ocrModel, ocrPrompt })}>
            保存
          </button>
          <button className="theme-btn theme-btn--cancel" onClick={onCancel}>取消</button>
        </div>
      </div>
    </div>
  );
}

export default function ApiSettings({ onBack }: Props) {
  const llmConfig = useSettingsStore((s) => s.llmConfig);
  const updateLLMConfig = useSettingsStore((s) => s.updateLLMConfig);
  const llmPresets = useSettingsStore((s) => s.llmPresets);
  const addPreset = useSettingsStore((s) => s.addPreset);
  const updatePreset = useSettingsStore((s) => s.updatePreset);
  const removePreset = useSettingsStore((s) => s.removePreset);
  const updateTTSConfig = useSettingsStore((s) => s.updateTTSConfig);
  const updateOCRConfig = useSettingsStore((s) => s.updateOCRConfig);

  // 表单临时状态
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(1);
  const [ttsProvider, setTtsProvider] = useState('');
  const [ttsApiKey, setTtsApiKey] = useState('');
  const [ttsModel, setTtsModel] = useState('');
  const [ttsVoice, setTtsVoice] = useState('');
  const [ocrModel, setOcrModel] = useState('');
  const [ocrPrompt, setOcrPrompt] = useState('');

  const [showKey, setShowKey] = useState(false);
  const [showTtsKey, setShowTtsKey] = useState(false);

  // 弹窗
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editingPreset, setEditingPreset] = useState<LLMPreset | null>(null);

  // 拉取模型
  const [models, setModels] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const handleFetchModels = useCallback(async () => {
    if (!baseUrl || !apiKey) {
      setFetchError('请先填写 API 地址和 API Key');
      return;
    }
    setFetching(true);
    setFetchError('');
    setModels([]);
    try {
      const base = baseUrl.replace(/\/+$/, '');
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
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
  }, [baseUrl, apiKey]);

  const clearForm = () => {
    setBaseUrl('');
    setApiKey('');
    setModel('');
    setTemperature(0.7);
    setTopP(1);
    setTtsProvider('');
    setTtsApiKey('');
    setTtsModel('');
    setTtsVoice('');
    setOcrModel('');
    setOcrPrompt('');
    setModels([]);
    setFetchError('');
  };

  /** 保存预设 */
  const handleSavePreset = useCallback((name: string) => {
    if (!name) return;
    const isFirst = llmPresets.length === 0;
    const preset: LLMPreset = {
      id: crypto.randomUUID(),
      name,
      baseUrl,
      apiKey,
      model: model || (models.length > 0 ? models[0] : ''),
      temperature,
      topP,
      ttsProvider: ttsProvider || undefined,
      ttsApiKey: ttsApiKey || undefined,
      ttsModel: ttsModel || undefined,
      ttsVoice: ttsVoice || undefined,
      ocrModel: ocrModel || undefined,
      ocrPrompt: ocrPrompt || undefined,
    };
    addPreset(preset);
    // 第一个预设自动全局应用
    if (isFirst) {
      updateLLMConfig({ baseUrl, apiKey, model: model || (models.length > 0 ? models[0] : ''), temperature, topP });
      if (ttsProvider) updateTTSConfig({ provider: ttsProvider, apiKey: ttsApiKey, model: ttsModel, voice: ttsVoice });
      if (ocrModel) updateOCRConfig({ model: ocrModel, prompt: ocrPrompt });
    }
    clearForm();
    setShowSaveModal(false);
  }, [baseUrl, apiKey, model, temperature, topP, ttsProvider, ttsApiKey, ttsModel, ttsVoice, ocrModel, ocrPrompt, models, llmPresets.length, addPreset, updateLLMConfig, updateTTSConfig, updateOCRConfig]);

  /** 全局应用预设 */
  const handleGlobalApply = useCallback((preset: LLMPreset) => {
    updateLLMConfig({
      baseUrl: preset.baseUrl,
      apiKey: preset.apiKey,
      model: preset.model,
      temperature: preset.temperature,
      topP: preset.topP,
    });
    if (preset.ttsProvider) {
      updateTTSConfig({
        provider: preset.ttsProvider,
        apiKey: preset.ttsApiKey || '',
        model: preset.ttsModel || '',
        voice: preset.ttsVoice || '',
      });
    }
    if (preset.ocrModel) {
      updateOCRConfig({
        model: preset.ocrModel,
        prompt: preset.ocrPrompt || '',
      });
    }
  }, [updateLLMConfig, updateTTSConfig, updateOCRConfig]);

  /** 修改预设保存 */
  const handleEditSave = useCallback((data: Partial<LLMPreset>) => {
    if (!editingPreset) return;
    updatePreset(editingPreset.id, data);
    setEditingPreset(null);
  }, [editingPreset, updatePreset]);

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <button className="back-btn" onClick={onBack}>
          <CaretLeft size={18} />
        </button>
        <h1>API 设置</h1>
      </div>

      <div className="settings-page__body">
        {/* ─── 聊天模型表单 ─── */}
        <div className="settings-section">
          <h2>聊天模型</h2>
          <p className="settings-section__desc">
            API Key 使用 Web Crypto API 加密后存储在本地，不会明文保存
          </p>

          <label className="settings-field">
            <span>API 地址</span>
            <input
              type="url"
              placeholder="https://api.openai.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </label>

          <label className="settings-field">
            <span>API Key</span>
            <div className="settings-field__row">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button className="settings-btn-icon" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeClosed size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <label className="settings-field">
            <span>模型</span>
            <div className="settings-field__row">
              <input
                type="text"
                placeholder="gpt-4o / deepseek-chat"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                list="api-model-suggestions"
              />
              <button className="settings-btn-icon" onClick={handleFetchModels} disabled={fetching} title="拉取模型列表">
                {fetching ? <Spinner size={18} className="spin" /> : <DownloadSimple size={18} />}
              </button>
            </div>
            {models.length > 0 && (
              <datalist id="api-model-suggestions">
                {models.map((m) => <option key={m} value={m} />)}
              </datalist>
            )}
            {fetchError && <span className="settings-field__hint settings-field__hint--error">{fetchError}</span>}
            {models.length > 0 && !fetchError && (
              <span className="settings-field__hint settings-field__hint--ok">已拉取 {models.length} 个模型</span>
            )}
          </label>

          <label className="settings-field">
            <span>Temperature ({temperature})</span>
            <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} />
          </label>

          <label className="settings-field">
            <span>Top P ({topP})</span>
            <input type="range" min="0" max="1" step="0.05" value={topP} onChange={(e) => setTopP(parseFloat(e.target.value))} />
          </label>
        </div>

        {/* ─── TTS 配置 ─── */}
        <div className="settings-section">
          <h2>TTS 语音</h2>
          <p className="settings-section__desc">配置语音合成供应商，智能体将使用此配置进行语音播报。</p>
          <label className="settings-field">
            <span>TTS 供应商</span>
            <select className="settings-select" value={ttsProvider} onChange={(e) => setTtsProvider(e.target.value)}>
              <option value="">不使用</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="minimax">MiniMax</option>
            </select>
          </label>
          {ttsProvider && (
            <>
              <label className="settings-field">
                <span>TTS API Key</span>
                <div className="settings-field__row">
                  <input type={showTtsKey ? 'text' : 'password'} placeholder="TTS Key..." value={ttsApiKey} onChange={(e) => setTtsApiKey(e.target.value)} />
                  <button className="settings-btn-icon" onClick={() => setShowTtsKey(!showTtsKey)}>
                    {showTtsKey ? <EyeClosed size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              <label className="settings-field">
                <span>TTS 模型</span>
                <input type="text" placeholder={ttsProvider === 'elevenlabs' ? 'eleven_turbo_v2_5' : 'speech-01'} value={ttsModel} onChange={(e) => setTtsModel(e.target.value)} />
              </label>
              <label className="settings-field">
                <span>语音 ID</span>
                <input type="text" placeholder="voice id..." value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)} />
              </label>
            </>
          )}
        </div>

        {/* ─── OCR 配置 ─── */}
        <div className="settings-section">
          <h2>OCR 模型</h2>
          <p className="settings-section__desc">
            当聊天模型非多模态时，OCR 模型接收图片并转述为文字后交给聊天模型。留空则使用聊天模型本身。
          </p>
          <label className="settings-field">
            <span>OCR 模型</span>
            <input type="text" placeholder="留空使用聊天模型" value={ocrModel} onChange={(e) => setOcrModel(e.target.value)} />
          </label>
          <label className="settings-field">
            <span>OCR 提示词</span>
            <textarea className="settings-textarea" rows={3} placeholder="自定义 OCR 提示词（可选）" value={ocrPrompt} onChange={(e) => setOcrPrompt(e.target.value)} />
          </label>
        </div>

        {/* ─── 保存按钮 ─── */}
        <div className="settings-section">
          <button className="theme-btn theme-btn--primary" onClick={() => setShowSaveModal(true)} disabled={!baseUrl || !apiKey} style={{ width: '100%', padding: '12px', fontSize: 15 }}>
            <FloppyDisk size={18} style={{ marginRight: 6 }} />
            保存为预设
          </button>
        </div>

        {/* ─── 预设列表 ─── */}
        <div className="settings-section">
          <h2>API 预设</h2>
          {llmPresets.length === 0 ? (
            <p className="settings-field__hint">暂无预设，填写上方表单后点击"保存为预设"创建。</p>
          ) : (
            <div className="preset-list">
              {llmPresets.map((p) => {
                const isGlobal = (
                  p.baseUrl === llmConfig.baseUrl &&
                  p.apiKey === llmConfig.apiKey &&
                  p.model === llmConfig.model
                );
                return (
                  <div key={p.id} className="preset-card">
                    <div className="preset-card__info">
                      <div className="preset-card__name">
                        {p.name}
                        {isGlobal && <CheckCircle size={14} color="var(--app-primary)" />}
                      </div>
                      <div className="preset-card__meta">
                        {p.model}
                        {p.ttsProvider && ` · TTS: ${p.ttsProvider}`}
                        {p.ocrModel && ` · OCR`}
                      </div>
                    </div>
                    <div className="preset-card__actions">
                      {!isGlobal && (
                        <button className="preset-card__btn preset-card__btn--apply" onClick={() => handleGlobalApply(p)}>
                          全局应用
                        </button>
                      )}
                      <button className="preset-card__btn" onClick={() => setEditingPreset(p)}>
                        修改配置
                      </button>
                      <button className="preset-card__btn preset-card__btn--danger" onClick={() => removePreset(p.id)}>
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="settings-page__footer">
        <button className="theme-btn" onClick={onBack}>确认</button>
        <button className="theme-btn theme-btn--cancel" onClick={onBack}>取消</button>
      </div>

      {/* 保存弹窗 */}
      {showSaveModal && <SavePresetModal onConfirm={handleSavePreset} onCancel={() => setShowSaveModal(false)} />}

      {/* 编辑弹窗 */}
      {editingPreset && (
        <EditPresetModal preset={editingPreset} onSave={handleEditSave} onCancel={() => setEditingPreset(null)} />
      )}
    </div>
  );
}
