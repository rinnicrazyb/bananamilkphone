import { useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { CaretLeft, UploadSimple, Trash, Wrench, MagnifyingGlass, Plugs, Code } from '@phosphor-icons/react';
import { useChatStore } from '../store/chat-store';
import { useSettingsStore } from '../../../store/settings-store';
import { DEFAULT_DISPLAY_CONFIG } from '../types';
import AvatarCrop from '../components/AvatarCrop';

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

  // 收集当前对话中的工具调用记录
  const rawMessages = useChatStore((s) =>
    activeConversationId ? s.messages[activeConversationId] : undefined
  ) ?? [];
  const toolCallEntries = (() => {
    const entries: Array<{ name: string; args: string; result: string }> = [];
    for (let i = 0; i < rawMessages.length; i++) {
      const msg = rawMessages[i];
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          const resultMsg = rawMessages.find((m) => m.role === 'tool' && m.toolCallId === tc.id);
          entries.push({
            name: tc.function.name,
            args: tc.function.arguments,
            result: resultMsg?.content || '（等待执行结果）',
          });
        }
      }
    }
    return entries;
  })();

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
        <button className="back-btn" onClick={onBack}><CaretLeft size={18} /> 返回</button>
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
          <span>自动折叠思考链</span>
          <input
            type="checkbox"
            checked={thinkingCollapsed}
            onChange={(e) => setThinkingChainCollapsed(e.target.checked)}
          />
        </label>
        <p className="settings-field__hint">
          开启后思考链默认收起，可手动展开
        </p>
        <div className="settings-field">
          <span>Tool Call 工具调用记录</span>
          <div className="settings-field__hint" style={{ marginTop: 4 }}>
            {toolCallEntries.length === 0
              ? '当前对话暂无工具调用'
              : toolCallEntries.map((entry, i) => (
                  <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--app-border)', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                      <Wrench size={14} /> {entry.name}
                    </div>
                    <div style={{ color: 'var(--app-text-secondary)', fontSize: 11, marginTop: 2 }}>
                      参数: {entry.args}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 2, maxHeight: 40, overflow: 'hidden', color: '#27ae60' }}>
                      {entry.result}
                    </div>
                  </div>
                ))}
          </div>
        </div>

        {/* 可用工具列表 */}
        <ToolListDisplay
          enabledSearchProviders={cfg.enabledSearchProviders ?? []}
          enabledMCPServerIds={cfg.enabledMCPServerIds ?? []}
          mcpServers={useSettingsStore.getState().mcpServers}
        />
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

/** 可用工具列表 — 按分类展示只读工具 */
function ToolListDisplay({ enabledSearchProviders, enabledMCPServerIds, mcpServers }: {
  enabledSearchProviders: string[];
  enabledMCPServerIds: string[];
  mcpServers: Array<{ id: string; name: string; discoveredTools?: Array<{ name: string; description: string; enabled?: boolean }> }>;
}) {
  const sections: Array<{ title: string; icon: ReactNode; tools: Array<{ name: string; desc: string }> }> = [];

  if (enabledSearchProviders.length > 0) {
    sections.push({
      title: '网络搜索',
      icon: <MagnifyingGlass size={16} />,
      tools: enabledSearchProviders.map((p) => ({
        name: 'search_web',
        desc: `搜索网络信息（${p}）`,
      })),
    });
  }

  const enabledMCPs = mcpServers.filter((s) => enabledMCPServerIds.includes(s.id));
  for (const server of enabledMCPs) {
    const tools = (server.discoveredTools || []).filter((t) => t.enabled !== false);
    if (tools.length > 0) {
      sections.push({
        title: `MCP · ${server.name}`,
        icon: <Plugs size={16} />,
        tools: tools.map((t) => ({ name: `mcp__${server.name}__${t.name}`, desc: t.description || '无描述' })),
      });
    }
  }

  sections.push({
    title: '本地工具',
    icon: <Code size={16} />,
    tools: [
      { name: 'get_time', desc: '获取当前时间' },
      { name: 'get_date', desc: '获取当前日期' },
    ],
  });

  if (sections.length === 0) {
    return <p className="settings-field__hint" style={{ marginTop: 8 }}>暂无可用工具</p>;
  }

  return (
    <div style={{ marginTop: 8 }}>
      {sections.map((section) => (
        <details key={section.title} style={{ marginBottom: 8 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            {section.icon}
            {section.title}（{section.tools.length}）
          </summary>
          <div style={{ marginTop: 4, paddingLeft: 4 }}>
            {section.tools.map((tool) => (
              <div key={tool.name} style={{ padding: '6px 8px', borderBottom: '1px solid var(--app-border)', fontSize: 12 }}>
                <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 11 }}>{tool.name}</div>
                <div style={{ color: 'var(--app-text-secondary)', fontSize: 11, marginTop: 2 }}>{tool.desc}</div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
