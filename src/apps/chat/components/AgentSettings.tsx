/**
 * 智能体设定面板
 *
 * 修改：
 * - 聊天模型列表仅显示设置APP中保存的 API 预设（去掉硬编码的 GPT/DeepSeek/Claude）
 * - 思考强度改为滑动条（RikkaHub 风格：关闭/低/中/高）
 */
import { useState, useRef } from 'react';
import { X, UploadSimple } from '@phosphor-icons/react';
import { useChatStore } from '../store/chat-store';
import { useSettingsStore } from '../../../store/settings-store';
import { useLorebookStore } from '../../../apps/lorebook/store/lorebook-store';
import ImageCrop from '../../../components/ImageCrop';

export default function AgentSettingsPanel() {
  const agents = useChatStore((s) => s.agents);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const updateAgentSettings = useChatStore((s) => s.updateAgentSettings);
  const updateAgent = useChatStore((s) => s.updateAgent);
  const updateAgentDisplayConfig = useChatStore((s) => s.updateAgentDisplayConfig);
  const setShowAgentSettings = useChatStore((s) => s.setShowAgentSettings);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customModel, setCustomModel] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const llmPresets = useSettingsStore((s) => s.llmPresets);
  const updateLLMConfig = useSettingsStore((s) => s.updateLLMConfig);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const agent = agents.find((a) => a.id === activeConv?.agentId);

  if (!agent) return null;

  const handleDelete = () => {
    const agentConvIds = conversations
      .filter((c) => c.agentId === agent.id)
      .map((c) => c.id);
    agentConvIds.forEach((id) => deleteConversation(id));
    setShowAgentSettings(false);
  };

  const handleModelSelect = (val: string) => {
    if (val === '__custom__') {
      setCustomModel(true);
      updateAgentSettings(agent.id, { model: '' });
    } else if (val.startsWith('preset__')) {
      const presetId = val.replace('preset__', '');
      const preset = llmPresets.find((p) => p.id === presetId);
      if (preset) {
        setCustomModel(false);
        updateLLMConfig({
          baseUrl: preset.baseUrl,
          apiKey: preset.apiKey,
          model: preset.model,
          temperature: preset.temperature,
          topP: preset.topP,
        });
        updateAgentSettings(agent.id, { model: preset.model });
      }
    } else {
      setCustomModel(false);
      updateAgentSettings(agent.id, { model: val || '' });
    }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setCropSrc(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = (cropped: string) => {
    updateAgent(agent.id, { avatar: cropped });
    setCropSrc(null);
  };

  const currentThinkingEffort = agent.displayConfig?.thinkingEffort;
  const thinkingEffortLabel =
    currentThinkingEffort == null ? '未启用' :
    currentThinkingEffort >= 70 ? '高' :
    currentThinkingEffort >= 40 ? '中' : '低';

  return (
    <div className="agent-settings-overlay" onClick={() => setShowAgentSettings(false)}>
      <div className="agent-settings" onClick={(e) => e.stopPropagation()}>
        <div className="agent-settings__header">
          <h2>智能体设定</h2>
          <button className="agent-settings__close" onClick={() => setShowAgentSettings(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="agent-settings__body">
          <label className="settings-field">
            <span>名称</span>
            <input type="text" value={agent.name}
              onChange={(e) => updateAgent(agent.id, { name: e.target.value })} />
          </label>

          <label className="settings-field">
            <span>头像</span>
            <div className="settings-field__row">
              {agent.avatar && <img src={agent.avatar} alt="avatar" className="settings-avatar-preview" />}
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleAvatarUpload} hidden />
              <input type="text" value={agent.avatar.startsWith('data:') ? '' : agent.avatar}
                onChange={(e) => updateAgent(agent.id, { avatar: e.target.value })}
                placeholder="输入 emoji 或图片 URL" style={{ flex: 1 }} />
              <button className="settings-btn-icon" onClick={() => fileInputRef.current?.click()} title="上传图片">
                <UploadSimple size={18} />
              </button>
            </div>
          </label>

          <label className="settings-field">
            <span>系统提示词</span>
            <textarea className="settings-textarea" rows={6}
              value={agent.settings.systemPrompt}
              onChange={(e) => updateAgentSettings(agent.id, { systemPrompt: e.target.value })}
              placeholder="AI 的角色设定..." />
          </label>

          <label className="settings-field">
            <span>聊天模型</span>
            <select className="settings-select"
              value={customModel ? '__custom__' : agent.settings.model || ''}
              onChange={(e) => handleModelSelect(e.target.value)}>
              <option value="">默认模型（设置APP中配置）</option>
              {llmPresets.length > 0 && <option disabled>─── API 预设 ───</option>}
              {llmPresets.map((p) => (
                <option key={p.id} value={`preset__${p.id}`}>
                  {p.name} ({p.model})
                </option>
              ))}
              <option value="__custom__">自定义...</option>
            </select>
            {customModel && (
              <input type="text" className="settings-field__sub" placeholder="输入模型名称..."
                value={agent.settings.model || ''}
                onChange={(e) => updateAgentSettings(agent.id, { model: e.target.value })} />
            )}
            <p className="settings-field__hint">选择"默认模型"则使用设置APP中配置的全局模型</p>
          </label>

          <label className="settings-field">
            <span>OCR 模型</span>
            <input type="text" value={agent.settings.ocrModel || ''}
              onChange={(e) => updateAgentSettings(agent.id, { ocrModel: e.target.value })}
              placeholder="留空则不使用" />
          </label>

          <label className="settings-field">
            <span>TTS 语音</span>
            <select className="settings-select" value={agent.settings.tts || ''}
              onChange={(e) => updateAgentSettings(agent.id, { tts: e.target.value })}>
              <option value="">关闭</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="minimax">MiniMax</option>
            </select>
          </label>

          <label className="settings-field">
            <span>Temperature ({agent.settings.temperature ?? '全局'})</span>
            <input type="range" min="0" max="2" step="0.1"
              value={agent.settings.temperature ?? 0.7}
              onChange={(e) => updateAgentSettings(agent.id, { temperature: parseFloat(e.target.value) })} />
          </label>

          <label className="settings-field">
            <span>Top P ({agent.settings.topP ?? '全局'})</span>
            <input type="range" min="0" max="1" step="0.05"
              value={agent.settings.topP ?? 1}
              onChange={(e) => updateAgentSettings(agent.id, { topP: parseFloat(e.target.value) })} />
          </label>

          {/* 思考强度滑动条 */}
          <div className="settings-field">
            <span>思考强度（{thinkingEffortLabel}）</span>
            <input type="range" min="0" max="100" step="10"
              value={currentThinkingEffort ?? 0}
              onChange={(e) => updateAgentDisplayConfig(agent.id, {
                thinkingEffort: parseInt(e.target.value) || undefined
              })} />
            <div className="settings-field__hint-row">
              <span className="settings-field__hint">关闭</span>
              <span className="settings-field__hint">低</span>
              <span className="settings-field__hint">中</span>
              <span className="settings-field__hint">高</span>
            </div>
            <p className="settings-field__hint">控制 reasoning_effort 参数。0=关闭，1-30=低，40-60=中，70-100=高。仅 DeepSeek/OpenAI 支持。</p>
          </div>

          <div className="settings-field">
            <span>世界书挂载</span>
            <WorldBookSelector agentId={agent.id} />
          </div>

          <div className="agent-settings__danger">
            {!showDeleteConfirm ? (
              <button className="agent-settings__delete-btn" onClick={() => setShowDeleteConfirm(true)}>
                删除该智能体
              </button>
            ) : (
              <div className="agent-settings__confirm">
                <p>确定删除「{agent.name}」及其所有对话？</p>
                <div className="agent-settings__confirm-btns">
                  <button className="agent-settings__delete-btn agent-settings__delete-btn--confirm" onClick={handleDelete}>
                    确认删除
                  </button>
                  <button className="theme-btn" onClick={() => setShowDeleteConfirm(false)}>
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="agent-settings__footer">
          <button className="theme-btn" onClick={() => setShowAgentSettings(false)}>
            确认
          </button>
        </div>
      </div>

      {cropSrc && (
        <ImageCrop src={cropSrc} shape="circle" onCrop={handleCropConfirm} onCancel={() => setCropSrc(null)} />
      )}
    </div>
  );
}

/** 世界书挂载选择器（勾选列表） */
function WorldBookSelector({ agentId }: { agentId: string }) {
  const lorebooks = useLorebookStore((s) => s.lorebooks);
  const updateAgentSettings = useChatStore((s) => s.updateAgentSettings);
  const agent = useChatStore((s) => s.agents.find((a) => a.id === agentId));
  const boundIds = agent?.settings?.worldBookIds ?? [];

  if (lorebooks.length === 0) {
    return <p className="settings-field__hint">暂无世界书，请先在世界书 APP 中创建</p>;
  }

  const toggleBook = (bookId: string) => {
    const newIds = boundIds.includes(bookId)
      ? boundIds.filter((id) => id !== bookId)
      : [...boundIds, bookId];
    updateAgentSettings(agentId, { worldBookIds: newIds });
  };

  return (
    <div className="worldbook-selector">
      {lorebooks.map((book) => (
        <label key={book.id} className="worldbook-selector__item">
          <input type="checkbox" checked={boundIds.includes(book.id)} onChange={() => toggleBook(book.id)} />
          <div className="worldbook-selector__info">
            <span className="worldbook-selector__name">{book.name || '未命名世界书'}</span>
            <span className="worldbook-selector__meta">
              {book.entries.length} 条条目{!book.enabled && ' · 已禁用'}
            </span>
          </div>
        </label>
      ))}
    </div>
  );
}
