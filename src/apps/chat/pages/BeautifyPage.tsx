import { useState, useRef } from 'react';
import { CaretLeft, UploadSimple, Trash } from '@phosphor-icons/react';
import { useChatStore } from '../store/chat-store';
import { DEFAULT_DISPLAY_CONFIG } from '../types';
import type { AgentDisplayConfig } from '../types';
import ImageCrop from '../../../components/ImageCrop';

interface BeautifyPageProps {
  onBack: () => void;
}

type ImageField = 'bgImage' | 'userBubbleImage' | 'assistantBubbleImage' | 'agentAvatarFrame' | 'userAvatarFrame';

export default function BeautifyPage({ onBack }: BeautifyPageProps) {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const agents = useChatStore((s) => s.agents);
  const updateAgentDisplayConfig = useChatStore((s) => s.updateAgentDisplayConfig);

  const conv = conversations.find((c) => c.id === activeConversationId);
  const agent = agents.find((a) => a.id === conv?.agentId);
  const cfg = agent?.displayConfig ?? DEFAULT_DISPLAY_CONFIG;

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const pendingField = useRef<ImageField | null>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const ubInputRef = useRef<HTMLInputElement>(null);
  const abInputRef = useRef<HTMLInputElement>(null);
  const afInputRef = useRef<HTMLInputElement>(null);
  const ufInputRef = useRef<HTMLInputElement>(null);

  if (!agent) return null;

  const update = (patch: Partial<AgentDisplayConfig>) => {
    updateAgentDisplayConfig(agent.id, patch);
  };

  const triggerUpload = (field: ImageField) => {
    pendingField.current = field;
    const refs: Record<ImageField, React.RefObject<HTMLInputElement | null>> = {
      bgImage: bgInputRef, userBubbleImage: ubInputRef, assistantBubbleImage: abInputRef,
      agentAvatarFrame: afInputRef, userAvatarFrame: ufInputRef,
    };
    refs[field].current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCropSrc(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = (cropped: string) => {
    const field = pendingField.current ?? 'bgImage';
    update({ [field]: cropped } as Partial<AgentDisplayConfig>);
    setCropSrc(null);
    pendingField.current = null;
  };

  const imgPreview = (src: string | undefined, alt: string) =>
    src ? <img src={src} alt={alt} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8 }} /> : null;

  const uploadRow = (field: ImageField, label: string, value: string | undefined) => (
    <div className="settings-field">
      <span>{label}</span>
      <div className="settings-field__row">
        {imgPreview(value, label)}
        <input type="file" accept="image/*" hidden
          ref={{ bgImage: bgInputRef, userBubbleImage: ubInputRef, assistantBubbleImage: abInputRef, agentAvatarFrame: afInputRef, userAvatarFrame: ufInputRef }[field]}
          onChange={handleFileChange} />
        <button className="settings-btn-icon" onClick={() => triggerUpload(field)}><UploadSimple size={18} /> 上传</button>
        {value && <button className="settings-btn-icon" onClick={() => update({ [field]: undefined } as Partial<AgentDisplayConfig>)}><Trash size={18} /> 移除</button>}
      </div>
    </div>
  );

  return (
    <div className="func-fullpage">
      <div className="func-fullpage__header">
        <button className="back-btn" onClick={onBack}><CaretLeft size={18} /></button>
        <h1>聊天美化</h1>
      </div>
      <div className="func-fullpage__body">
        <section className="settings-section">
          <h2>聊天背景</h2>
          {uploadRow('bgImage', '背景图片', cfg.bgImage)}
          <label className="settings-field">
            <span>背景透明度 ({Math.round(cfg.bgOpacity * 100)}%)</span>
            <input type="range" min="0" max="1" step="0.05" value={cfg.bgOpacity}
              onChange={(e) => update({ bgOpacity: parseFloat(e.target.value) })}
              onInput={(e) => update({ bgOpacity: parseFloat((e.target as HTMLInputElement).value) })} />
          </label>
          <label className="settings-field">
            <span>背景模糊度 ({cfg.bgBlur}px)</span>
            <input type="range" min="0" max="20" step="1" value={cfg.bgBlur}
              onChange={(e) => update({ bgBlur: parseInt(e.target.value) })}
              onInput={(e) => update({ bgBlur: parseInt((e.target as HTMLInputElement).value) })} />
          </label>
        </section>

        <section className="settings-section">
          <h2>显示选项</h2>
          {(['showAvatars', 'useBubbles', 'segmentBubbles', 'bubbleFollowAvatar', 'showTime', 'showTokens', 'showBranchArrows', 'showReasoningDuration', 'autoScroll'] as const).map((key) => (
            <label key={key} className="settings-field settings-field--row">
              <span>{{ showAvatars: '显示头像', useBubbles: '使用气泡样式', segmentBubbles: '气泡按段分割', bubbleFollowAvatar: '气泡跟随头像', showTime: '显示消息时间', showTokens: '显示 Token 数', showBranchArrows: '显示分支箭头', showReasoningDuration: '显示推理耗时', autoScroll: 'AI 生成时自动滚动' }[key]}</span>
              <input type="checkbox" checked={cfg[key]} onChange={(e) => update({ [key]: e.target.checked } as Partial<AgentDisplayConfig>)} />
            </label>
          ))}
        </section>

        <section className="settings-section">
          <h2>自定义气泡框</h2>
          <p className="settings-field__hint" style={{ marginBottom: 8 }}>
            上传 PNG 图片作为气泡背景框。推荐 9 宫格设计：四角不变形区域控制在 30px 以内，中间区域自动拉伸。
            用户气泡尾巴在右侧，助手气泡尾巴在左侧。
          </p>
          {uploadRow('userBubbleImage', '用户消息气泡', cfg.userBubbleImage)}
          {uploadRow('assistantBubbleImage', '助手消息气泡', cfg.assistantBubbleImage)}
        </section>

        <section className="settings-section">
          <h2>自定义头像框</h2>
          {uploadRow('agentAvatarFrame', '智能体头像框', cfg.agentAvatarFrame)}
          {uploadRow('userAvatarFrame', '用户头像框', cfg.userAvatarFrame)}
        </section>
      </div>

      {cropSrc && (
        <ImageCrop src={cropSrc} shape="rect" onCrop={handleCropConfirm} onCancel={() => { setCropSrc(null); pendingField.current = null; }} />
      )}
    </div>
  );
}
