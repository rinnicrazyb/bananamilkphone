/**
 * ExportDrawer — 对话导出底部抽屉
 *
 * 对标 RikkaHub ChatExportSheet：
 * - 默认全选消息（不含 tool 消息）
 * - 可勾选/取消单选
 * - Markdown 格式，可选包含思考链
 */
import { useState, useMemo } from 'react';
import type { Message } from '../types';

interface Props {
  open: boolean;
  messages: Message[];
  conversationTitle: string;
  onClose: () => void;
}

export default function ExportDrawer({ open, messages, conversationTitle, onClose }: Props) {
  const displayMessages = useMemo(() => messages.filter(m => m.role !== 'tool'), [messages]);
  const [selected, setSelected] = useState<Set<string>>(new Set(displayMessages.map(m => m.id)));
  const [includeReasoning, setIncludeReasoning] = useState(true);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(prev => prev.size === displayMessages.length ? new Set() : new Set(displayMessages.map(m => m.id)));
  };

  const handleExport = () => {
    const selectedMsgs = displayMessages.filter(m => selected.has(m.id));
    const md = buildMarkdown(selectedMsgs, conversationTitle, includeReasoning);
    downloadMarkdown(md);
    onClose();
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  if (!open) return null;

  return (
    <>
      <div className="msg-edit-overlay" onClick={onClose} />
      <div className="msg-edit-drawer" style={{ maxHeight: '80vh' }}>
        <div className="msg-edit-drawer__handle">
          <div className="msg-edit-drawer__bar" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>导出对话</span>
            <button onClick={handleExport} style={{
              background: 'var(--app-primary)', color: '#fff', border: 'none',
              borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
            }}>
              导出 Markdown
            </button>
          </div>
        </div>

        {/* 全选 + 思考链选项 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={selected.size === displayMessages.length} onChange={toggleAll} />
            全选 ({selected.size}/{displayMessages.length})
          </label>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={includeReasoning} onChange={e => setIncludeReasoning(e.target.checked)} />
            包含思考链
          </label>
        </div>

        {/* 消息选择列表 */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {displayMessages.map(msg => (
            <label key={msg.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0',
              cursor: 'pointer', borderBottom: '1px solid var(--app-border)',
            }}>
              <input type="checkbox" checked={selected.has(msg.id)} onChange={() => toggle(msg.id)} style={{ marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--app-primary)', marginBottom: 2 }}>
                  {msg.role === 'user' ? '用户' : '助手'} · {formatTime(msg.timestamp)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--app-text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {(msg.content || '').slice(0, 80)}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

function buildMarkdown(messages: Message[], title: string, includeReasoning: boolean): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push(`*导出于 ${new Date().toLocaleString('zh-CN')}*`);
  lines.push('');

  for (const msg of messages) {
    const role = msg.role === 'user' ? '**User**' : '**Assistant**';
    lines.push(`${role}:`);
    lines.push('');

    if (includeReasoning && msg.reasoning) {
      lines.push('> ' + msg.reasoning.split('\n').join('\n> '));
      lines.push('');
    }

    lines.push(msg.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function downloadMarkdown(md: string) {
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat-export-${new Date().toISOString().slice(0, 10)}.md`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
