import { useState, useRef } from 'react';
import { useChatStore } from '../store/chat-store';
import AvatarCrop from './AvatarCrop';

const PRESET_MODELS = [
  { value: '', label: '使用全局设置' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
  { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
  { value: '__custom__', label: '自定义...' },
];

export default function AgentSettingsPanel() {
  const agents = useChatStore((s) => s.agents);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const updateAgentSettings = useChatStore((s) => s.updateAgentSettings);
  const updateAgent = useChatStore((s) => s.updateAgent);
  const setShowAgentSettings = useChatStore((s) => s.setShowAgentSettings);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customModel, setCustomModel] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    } else {
      setCustomModel(false);
      updateAgentSettings(agent.id, { model: val });
    }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setCropSrc(dataUrl); // 打开裁剪界面
    };
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = (cropped: string) => {
    updateAgent(agent.id, { avatar: cropped });
    setCropSrc(null);
  };

  const isCustom = !PRESET_MODELS.some((m) => m.value === agent.settings.model);

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
            <div className="settings-field__row">
              {agent.avatar && (
                <img
                  src={agent.avatar}
                  alt="avatar"
                  className="settings-avatar-preview"
                />
              )}
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleAvatarUpload}
                hidden
              />
              <input
                type="text"
                value={agent.avatar.startsWith('data:') ? '' : agent.avatar}
                onChange={(e) => updateAgent(agent.id, { avatar: e.target.value })}
                placeholder="输入 emoji 或图片 URL"
                style={{ flex: 1 }}
              />
              <button
                className="settings-btn-icon"
                onClick={() => fileInputRef.current?.click()}
                title="上传图片"
              >
                📁
              </button>
            </div>
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
            <span>聊天模型</span>
            <select
              className="settings-select"
              value={isCustom && !customModel ? '__custom__' : agent.settings.model || ''}
              onChange={(e) => handleModelSelect(e.target.value)}
            >
              {PRESET_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            {(customModel || isCustom) && (
              <input
                type="text"
                className="settings-field__sub"
                placeholder="输入模型名称..."
                value={agent.settings.model || ''}
                onChange={(e) =>
                  updateAgentSettings(agent.id, { model: e.target.value })
                }
              />
            )}
          </label>

          <label className="settings-field">
            <span>OCR 模型</span>
            <input
              type="text"
              value={agent.settings.ocrModel || ''}
              onChange={(e) =>
                updateAgentSettings(agent.id, { ocrModel: e.target.value })
              }
              placeholder="留空则不使用"
            />
          </label>

          <label className="settings-field">
            <span>TTS 语音</span>
            <select
              className="settings-select"
              value={agent.settings.tts || ''}
              onChange={(e) =>
                updateAgentSettings(agent.id, { tts: e.target.value })
              }
            >
              <option value="">关闭</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="minimax">MiniMax</option>
            </select>
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

          <div className="settings-field">
            <span>世界书挂载</span>
            <p className="settings-field__hint">（后续版本支持）</p>
          </div>

          <div className="agent-settings__danger">
            {!showDeleteConfirm ? (
              <button
                className="agent-settings__delete-btn"
                onClick={() => setShowDeleteConfirm(true)}
              >
                删除该智能体
              </button>
            ) : (
              <div className="agent-settings__confirm">
                <p>确定删除「{agent.name}」及其所有对话？</p>
                <div className="agent-settings__confirm-btns">
                  <button
                    className="agent-settings__delete-btn agent-settings__delete-btn--confirm"
                    onClick={handleDelete}
                  >
                    确认删除
                  </button>
                  <button
                    className="theme-btn"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
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

      {cropSrc && (
        <AvatarCrop
          src={cropSrc}
          onCrop={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </div>
  );
}
