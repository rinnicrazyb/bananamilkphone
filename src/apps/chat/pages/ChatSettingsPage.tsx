import { useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { CaretLeft, UploadSimple, Trash, MagnifyingGlass, Plugs, Code, Clock } from '@phosphor-icons/react';
import { useChatStore } from '../store/chat-store';
import { useSettingsStore } from '../../../store/settings-store';
import { DEFAULT_DISPLAY_CONFIG } from '../types';
import ImageCrop from '../../../components/ImageCrop';

interface ChatSettingsPageProps {
  onBack: () => void;
}

export default function ChatSettingsPage({ onBack }: ChatSettingsPageProps) {
  const thinkingCollapsed = useChatStore((s) => s.thinkingChainCollapsed);
  const setThinkingChainCollapsed = useChatStore((s) => s.setThinkingChainCollapsed);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const agents = useChatStore((s) => s.agents);
  const updateAgentDisplayConfig = useChatStore((s) => s.updateAgentDisplayConfig);

  const conv = conversations.find((c) => c.id === activeConversationId);
  const agent = agents.find((a) => a.id === conv?.agentId);
  const cfg = agent?.displayConfig ?? DEFAULT_DISPLAY_CONFIG;

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!agent) return null;

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCropSrc(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = (cropped: string) => {
    updateAgentDisplayConfig(agent.id, { userAvatar: cropped });
    setCropSrc(null);
  };

  return (
    <div className="func-fullpage">
      <div className="func-fullpage__header">
        <button className="back-btn" onClick={onBack}><CaretLeft size={18} /></button>
        <h1>聊天设置</h1>
      </div>
      <div className="func-fullpage__body">
        <label className="settings-field">
          <span>用户头像</span>
          <div className="settings-field__row">
            {cfg.userAvatar && (
              <img src={cfg.userAvatar} alt="用户头像" className="settings-avatar-preview" />
            )}
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleAvatarUpload} hidden />
            <button className="settings-btn-icon" onClick={() => fileInputRef.current?.click()}>
              <UploadSimple size={18} /> 上传
            </button>
            {cfg.userAvatar && (
              <button className="settings-btn-icon" onClick={() => updateAgentDisplayConfig(agent.id, { userAvatar: undefined })}>
                <Trash size={18} /> 移除
              </button>
            )}
          </div>
        </label>

        <label className="settings-field settings-field--row">
          <span>自动折叠思考链和工具链</span>
          <input
            type="checkbox"
            checked={thinkingCollapsed}
            onChange={(e) => setThinkingChainCollapsed(e.target.checked)}
          />
        </label>
        <p className="settings-field__hint">
          开启后思考链和工具链默认收起，可手动展开
        </p>

        {/* 可用工具列表 — context-block 风格 */}
        <ToolListDisplay
          enabledSearchProviders={cfg.enabledSearchProviders ?? []}
          enabledMCPServerIds={cfg.enabledMCPServerIds ?? []}
          mcpServers={useSettingsStore.getState().mcpServers}
        />
      </div>

      {cropSrc && (
        <ImageCrop
          src={cropSrc}
          shape="circle"
          onCrop={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </div>
  );
}

/** 可用工具列表 — context-block 风格：外层大折叠 → 内部按来源分组嵌套 */
function ToolListDisplay({ enabledSearchProviders, enabledMCPServerIds, mcpServers }: {
  enabledSearchProviders: string[];
  enabledMCPServerIds: string[];
  mcpServers: Array<{ id: string; name: string; discoveredTools?: Array<{ name: string; description: string; enabled?: boolean }> }>;
}) {
  const enabledMCPs = mcpServers.filter((s) => enabledMCPServerIds.includes(s.id));

  // 构建内部区块数据
  const groups: Array<{ title: string; icon: ReactNode; tools: Array<{ name: string; desc: string }> }> = [];

  if (enabledSearchProviders.length > 0) {
    groups.push({
      title: '网络搜索',
      icon: <MagnifyingGlass size={14} />,
      tools: enabledSearchProviders.map((p) => ({
        name: 'search_web',
        desc: `搜索网络信息（${p}）`,
      })),
    });
  }

  for (const server of enabledMCPs) {
    const tools = (server.discoveredTools || []).filter((t) => t.enabled !== false);
    if (tools.length > 0) {
      groups.push({
        title: server.name,
        icon: <Plugs size={14} />,
        tools: tools.map((t) => ({ name: `mcp__${server.name}__${t.name}`, desc: t.description || '无描述' })),
      });
    }
  }

  // 本地工具占位（即将推出）
  groups.push({
    title: '本地工具',
    icon: <Code size={14} />,
    tools: [
      { name: 'get_time', desc: '获取当前时间' },
      { name: 'get_date', desc: '获取当前日期' },
    ],
  });

  const totalToolCount = groups.reduce((s, g) => s + g.tools.length, 0);

  if (totalToolCount === 0) {
    return <p className="settings-field__hint" style={{ marginTop: 8 }}>暂无可用工具</p>;
  }

  return (
    <details className="context-block" style={{ marginTop: 12 }}>
      <summary className="context-block__header">
        <span className="context-block__tag context-block__tag--tool">
          <Clock size={14} weight="fill" /> 可用工具
        </span>
        <span className="context-block__tokens">{totalToolCount} 个</span>
      </summary>
      <div className="context-block__content">
        {groups.map((group) => (
          <details key={group.title} style={{ margin: '4px 0' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 500, fontSize: 12, padding: '4px 8px', background: 'var(--app-secondary)' }}>
              {group.icon} {group.title}（{group.tools.length}）
            </summary>
            <div style={{ padding: '4px 0' }}>
              {group.tools.map((tool) => (
                <div key={tool.name} style={{ padding: '6px 12px', borderBottom: '1px solid var(--app-border)', fontSize: 13 }}>
                  <div style={{ fontWeight: 600, fontFamily: 'monospace', marginBottom: 2 }}>{tool.name}</div>
                  <div style={{ color: 'var(--app-text-secondary)', fontSize: 12 }}>{tool.desc}</div>
                </div>
              ))}
              {group.title === '本地工具' && (
                <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--app-text-secondary)', fontStyle: 'italic' }}>
                  ⏳ 即将推出
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </details>
  );
}
