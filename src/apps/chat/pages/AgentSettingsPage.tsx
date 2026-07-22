/**
 * 智能体设定页面（全屏页面替代旧弹窗设计）
 *
 * 改动：
 * - 弹窗 → 全屏页面
 * - 系统提示词 textarea 自适应高度，无限增长，页面滚动
 * - 世界书挂载：点击 → 弹窗勾选列表 + 已选世界书条目预览（只读）+ 编辑跳转
 * - API 预设选中支持 presetId（任务3）
 */
import { useState, useRef, useCallback } from 'react';
import { CaretLeft, X, UploadSimple, PencilSimple } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/chat-store';
import { useSettingsStore } from '../../../store/settings-store';
import { useLorebookStore } from '../../../apps/lorebook/store/lorebook-store';
import type { Lorebook } from '../../../apps/lorebook/types';
import ImageCrop from '../../../components/ImageCrop';

interface Props {
  onBack: () => void;
}

export default function AgentSettingsPage({ onBack }: Props) {
  const navigate = useNavigate();
  const agents = useChatStore((s) => s.agents);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const updateAgentSettings = useChatStore((s) => s.updateAgentSettings);
  const updateAgent = useChatStore((s) => s.updateAgent);
  const updateAgentDisplayConfig = useChatStore((s) => s.updateAgentDisplayConfig);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const setShowAgentSettings = useChatStore((s) => s.setShowAgentSettings);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customModel, setCustomModel] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [worldBookModal, setWorldBookModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const llmPresets = useSettingsStore((s) => s.llmPresets);

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
      updateAgentSettings(agent.id, { presetId: undefined, model: '' });
    } else if (val === '') {
      setCustomModel(false);
      updateAgentSettings(agent.id, { presetId: undefined, model: undefined, temperature: undefined, topP: undefined });
    } else if (val.startsWith('preset__')) {
      const presetId = val.replace('preset__', '');
      const preset = llmPresets.find((p) => p.id === presetId);
      if (preset) {
        setCustomModel(false);
        updateAgentSettings(agent.id, {
          presetId,
          model: preset.model,
          temperature: preset.temperature,
          topP: preset.topP,
          ocrModel: preset.ocrModel || undefined,
          tts: preset.ttsProvider || undefined,
        });
      }
    } else {
      setCustomModel(false);
      updateAgentSettings(agent.id, { model: val || '' });
    }
  };

  const selectValue = agent.settings.presetId
    ? `preset__${agent.settings.presetId}`
    : customModel
      ? '__custom__'
      : agent.settings.model || '';

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
    <div className="settings-page">
      <div className="settings-page__header">
        <button className="back-btn" onClick={onBack}>
          <CaretLeft size={18} />
        </button>
        <h1>智能体设定</h1>
      </div>

      <div className="settings-page__body">
        {/* ── 名称 ── */}
        <label className="settings-field">
          <span>名称</span>
          <input type="text" value={agent.name}
            onChange={(e) => updateAgent(agent.id, { name: e.target.value })} />
        </label>

        {/* ── 头像 ── */}
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

        {/* ── 系统提示词 ── */}
        <label className="settings-field">
          <span>系统提示词</span>
          <SystemPromptTextarea
            value={agent.settings.systemPrompt}
            onChange={(v) => updateAgentSettings(agent.id, { systemPrompt: v })}
          />
        </label>

        {/* ── 聊天模型 ── */}
        <label className="settings-field">
          <span>聊天模型</span>
          <select className="settings-select"
            value={selectValue}
            onChange={(e) => handleModelSelect(e.target.value)}>
            <option value="">默认模型（全局配置）</option>
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
          <p className="settings-field__hint">选择"默认模型"则使用设置APP中的全局配置</p>
        </label>

        {/* ── OCR 模型 ── */}
        <label className="settings-field">
          <span>OCR 模型</span>
          <input type="text" value={agent.settings.ocrModel || ''}
            onChange={(e) => updateAgentSettings(agent.id, { ocrModel: e.target.value })}
            placeholder="留空则不使用" />
        </label>

        {/* ── TTS 语音 ── */}
        <label className="settings-field">
          <span>TTS 语音</span>
          <select className="settings-select" value={agent.settings.tts || ''}
            onChange={(e) => updateAgentSettings(agent.id, { tts: e.target.value })}>
            <option value="">关闭</option>
            <option value="elevenlabs">ElevenLabs</option>
            <option value="minimax">MiniMax</option>
          </select>
        </label>

        {/* ── Temperature ── */}
        <label className="settings-field">
          <span>Temperature ({agent.settings.temperature ?? '全局'})</span>
          <input type="range" min="0" max="2" step="0.1"
            value={agent.settings.temperature ?? 0.7}
            onChange={(e) => updateAgentSettings(agent.id, { temperature: parseFloat(e.target.value) })} />
        </label>

        {/* ── Top P ── */}
        <label className="settings-field">
          <span>Top P ({agent.settings.topP ?? '全局'})</span>
          <input type="range" min="0" max="1" step="0.05"
            value={agent.settings.topP ?? 1}
            onChange={(e) => updateAgentSettings(agent.id, { topP: parseFloat(e.target.value) })} />
        </label>

        {/* ── 思考强度 ── */}
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
          <p className="settings-field__hint">控制 reasoning_effort 参数。仅 DeepSeek/OpenAI 支持。</p>
        </div>

        {/* ── 世界书挂载 ── */}
        <div className="settings-field">
          <span>世界书挂载</span>
          <WorldBookField agentId={agent.id} onOpenModal={() => setWorldBookModal(true)} />
        </div>

        {/* ── 删除 ── */}
        <div className="agent-settings__danger">
          {!showDeleteConfirm ? (
            <button className="agent-settings__delete-btn" onClick={() => setShowDeleteConfirm(true)}>
              删除该智能体
            </button>
          ) : (
            <div className="agent-settings__confirm">
              <p>确定删除「{agent.name}」及其所有对话？</p>
              <div className="agent-settings__confirm-btns">
                <button className="agent-settings__delete-btn agent-settings__delete-btn--confirm" onClick={handleDelete}>确认删除</button>
                <button className="theme-btn" onClick={() => setShowDeleteConfirm(false)}>取消</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="settings-page__footer">
        <button className="theme-btn" onClick={onBack}>确认</button>
        <button className="theme-btn theme-btn--cancel" onClick={onBack}>取消</button>
      </div>

      {/* 头像裁剪 */}
      {cropSrc && (
        <ImageCrop src={cropSrc} shape="circle" onCrop={handleCropConfirm} onCancel={() => setCropSrc(null)} />
      )}

      {/* 世界书选择弹窗 */}
      {worldBookModal && (
        <WorldBookModal
          agentId={agent.id}
          onClose={() => setWorldBookModal(false)}
          onNavigate={(id) => { setWorldBookModal(false); navigate(`/lorebook/${id}`); }}
        />
      )}
    </div>
  );
}

/** 系统提示词 textarea：自适应高度，无上限，页面级滚动 */
function SystemPromptTextarea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // 初始化高度
  const initRef = useRef(false);
  if (!initRef.current && ref.current) {
    initRef.current = true;
    requestAnimationFrame(adjustHeight);
  }

  return (
    <textarea
      ref={ref}
      className="settings-textarea settings-textarea--auto"
      value={value}
      onChange={(e) => { onChange(e.target.value); requestAnimationFrame(adjustHeight); }}
      placeholder="AI 的角色设定..."
    />
  );
}

/** 世界书挂载区域：显示已选世界书摘要 + 选择按钮 */
function WorldBookField({ agentId, onOpenModal }: { agentId: string; onOpenModal: () => void }) {
  const lorebooks = useLorebookStore((s) => s.lorebooks);
  const agent = useChatStore((s) => s.agents.find((a) => a.id === agentId));
  const boundIds = agent?.settings?.worldBookIds ?? [];
  const boundBooks = lorebooks.filter((b) => boundIds.includes(b.id));

  return (
    <div className="worldbook-field">
      {boundBooks.length > 0 ? (
        <div className="worldbook-field__list">
          {boundBooks.map((book) => (
            <div key={book.id} className="worldbook-field__item">
              <span className="worldbook-field__name">{book.name || '未命名'}</span>
              <span className="worldbook-field__meta">{book.entries.length} 条</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="settings-field__hint">未挂载世界书</p>
      )}
      <button className="theme-btn" onClick={onOpenModal} style={{ marginTop: 8 }}>
        选择世界书
      </button>
    </div>
  );
}

/** 世界书选择弹窗：勾选列表 + 已选中书籍的条目预览 */
function WorldBookModal({
  agentId,
  onClose,
  onNavigate,
}: {
  agentId: string;
  onClose: () => void;
  onNavigate: (bookId: string) => void;
}) {
  const lorebooks = useLorebookStore((s) => s.lorebooks);
  const updateAgentSettings = useChatStore((s) => s.updateAgentSettings);
  const agent = useChatStore((s) => s.agents.find((a) => a.id === agentId));
  const [selectedIds, setSelectedIds] = useState<string[]>(agent?.settings?.worldBookIds ?? []);

  const toggleBook = (bookId: string) => {
    setSelectedIds((prev) =>
      prev.includes(bookId) ? prev.filter((id) => id !== bookId) : [...prev, bookId]
    );
  };

  const handleSave = () => {
    updateAgentSettings(agentId, { worldBookIds: selectedIds });
    onClose();
  };

  // 已选中的世界书
  const selectedBooks = lorebooks.filter((b) => selectedIds.includes(b.id));

  // 条目排序：按注入位置顺序 + 优先级降序
  const sortEntries = (book: Lorebook) => {
    const posOrder = ['BEFORE_SYSTEM_PROMPT', 'AFTER_SYSTEM_PROMPT', 'TOP_OF_CHAT', 'AT_DEPTH', 'BOTTOM_OF_CHAT'];
    const positionLabel: Record<string, string> = {
      BEFORE_SYSTEM_PROMPT: '系统提示词前',
      AFTER_SYSTEM_PROMPT: '系统提示词后',
      TOP_OF_CHAT: '对话开头',
      AT_DEPTH: '指定深度',
      BOTTOM_OF_CHAT: '最新消息前',
    };
    return [...book.entries]
      .filter((e) => e.enabled)
      .sort((a, b) => {
        const pa = posOrder.indexOf(a.position);
        const pb = posOrder.indexOf(b.position);
        if (pa !== pb) return pa - pb;
        return (b.priority ?? 50) - (a.priority ?? 50);
      })
      .map((e) => ({
        ...e,
        positionLabel: positionLabel[e.position] || e.position,
      }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog modal-dialog--wide" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh' }}>
        <div className="modal-dialog__header">
          <h3>世界书挂载</h3>
          <button className="agent-settings__close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {lorebooks.length === 0 ? (
            <p className="settings-field__hint">暂无世界书，请先在世界书 APP 中创建</p>
          ) : (
            <>
              {/* 勾选列表 */}
              <div className="worldbook-modal__checklist">
                {lorebooks.map((book) => (
                  <label key={book.id} className="worldbook-modal__checkitem">
                    <input type="checkbox" checked={selectedIds.includes(book.id)} onChange={() => toggleBook(book.id)} />
                    <span className="worldbook-modal__checkname">{book.name || '未命名世界书'}</span>
                    <span className="worldbook-modal__checkmeta">
                      {book.entries.length} 条{!book.enabled && ' · 已禁用'}
                    </span>
                  </label>
                ))}
              </div>

              {/* 已选中世界书的条目预览 */}
              {selectedBooks.length > 0 && (
                <div className="worldbook-modal__preview">
                  <h4>注入顺序预览（仅启用条目，只读）</h4>
                  {selectedBooks.map((book) => {
                    const sorted = sortEntries(book);
                    return (
                      <div key={book.id} className="worldbook-modal__book">
                        <div className="worldbook-modal__book-header">
                          <span className="worldbook-modal__book-name">{book.name || '未命名'}</span>
                          <button className="preset-card__btn" onClick={() => onNavigate(book.id)}>
                            <PencilSimple size={12} /> 编辑
                          </button>
                        </div>
                        {sorted.length === 0 ? (
                          <p className="settings-field__hint">无启用条目</p>
                        ) : (
                          <div className="worldbook-modal__entries">
                            {sorted.map((entry) => (
                              <div key={entry.id} className="worldbook-modal__entry">
                                <div className="worldbook-modal__entry-header">
                                  <span className="worldbook-modal__entry-name">{entry.name || '未命名条目'}</span>
                                  <span className="worldbook-modal__entry-pos">
                                    {entry.positionLabel} · 优先级 {entry.priority ?? 50}
                                  </span>
                                </div>
                                <div className="worldbook-modal__entry-keywords">
                                  {entry.keywords.map((kw, i) => (
                                    <span key={i} className="worldbook-modal__kw">{kw}</span>
                                  ))}
                                </div>
                                <div className="worldbook-modal__entry-content">
                                  {entry.content.slice(0, 200)}{entry.content.length > 200 && '...'}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-actions">
          <button className="theme-btn" onClick={handleSave}>确认</button>
          <button className="theme-btn theme-btn--cancel" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
