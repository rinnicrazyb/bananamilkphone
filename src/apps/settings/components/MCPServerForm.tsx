import { useState } from 'react';
import { X } from '@phosphor-icons/react';
import type { MCPServer, MCPProtocol } from '../types';

interface Props {
  initial?: MCPServer;
  onConfirm: (data: MCPServerFormData) => void;
  onCancel: () => void;
}

export interface MCPServerFormData {
  name: string;
  url: string;
  headers: Record<string, string>;
  protocol: MCPProtocol;
}

interface HeaderEntry {
  key: string;
  value: string;
}

function headersToEntries(headers: Record<string, string>): HeaderEntry[] {
  const entries = Object.entries(headers);
  return entries.length > 0 ? entries.map(([k, v]) => ({ key: k, value: v })) : [{ key: '', value: '' }];
}

function entriesToHeaders(entries: HeaderEntry[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const e of entries) {
    if (e.key.trim()) result[e.key.trim()] = e.value;
  }
  return result;
}

export default function MCPServerForm({ initial, onConfirm, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [headers, setHeaders] = useState<HeaderEntry[]>(() => headersToEntries(initial?.headers ?? {}));
  const [protocol, setProtocol] = useState<MCPProtocol>(initial?.protocol ?? 'sse');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateHeader = (idx: number, field: 'key' | 'value', val: string) => {
    setHeaders((prev) => prev.map((h, i) => (i === idx ? { ...h, [field]: val } : h)));
  };

  const addHeader = () => setHeaders((prev) => [...prev, { key: '', value: '' }]);

  const removeHeader = (idx: number) => {
    setHeaders((prev) => prev.filter((_, i) => i !== idx));
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = '请输入服务器名称';
    if (!url.trim()) {
      errs.url = '请输入服务器 URL';
    } else {
      try {
        const u = new URL(url);
        if (!u.protocol.startsWith('http')) errs.url = 'URL 必须以 http:// 或 https:// 开头';
      } catch {
        errs.url = 'URL 格式不正确';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onConfirm({
      name: name.trim(),
      url: url.trim(),
      headers: entriesToHeaders(headers),
      protocol,
    });
  };

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <h1>{initial ? '编辑 MCP 服务器' : '添加 MCP 服务器'}</h1>
      </div>

      <form className="settings-page__body" onSubmit={handleSubmit}>
        <div className="settings-section">
          {/* 名称 */}
          <label className="settings-field">
            <span>服务器名称</span>
            <input
              type="text"
              placeholder="例如：本地文件系统"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {errors.name && <span className="settings-field__hint settings-field__hint--error">{errors.name}</span>}
          </label>

          {/* URL */}
          <label className="settings-field">
            <span>服务器 URL</span>
            <input
              type="url"
              placeholder="https://example.com/mcp"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            {errors.url && <span className="settings-field__hint settings-field__hint--error">{errors.url}</span>}
          </label>

          {/* 自定义请求头 */}
          <label className="settings-field">
            <span>自定义请求头</span>
            <div className="settings-field__hint" style={{ marginBottom: 8 }}>
              添加 HTTP 请求头（如 Authorization: Bearer xxx）
            </div>
            {headers.map((h, idx) => (
              <div key={idx} className="settings-field__row" style={{ marginBottom: 6 }}>
                <input
                  type="text"
                  placeholder="Header 名称"
                  value={h.key}
                  onChange={(e) => updateHeader(idx, 'key', e.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <input
                  type="text"
                  placeholder="值"
                  value={h.value}
                  onChange={(e) => updateHeader(idx, 'value', e.currentTarget.value)}
                  style={{ flex: 2 }}
                />
                <button type="button" className="mcp-card__btn mcp-card__btn--danger" onClick={() => removeHeader(idx)}>
                  <X size={16} />
                </button>
              </div>
            ))}
            <button type="button" className="mcp-card__btn" onClick={addHeader} style={{ alignSelf: 'flex-start' }}>
              + 添加请求头
            </button>
          </label>

          {/* 协议 */}
          <label className="settings-field">
            <span>传输协议</span>
            <div className="settings-field__row">
              <label className="settings-radio">
                <input type="radio" name="protocol" value="sse" checked={protocol === 'sse'} onChange={() => setProtocol('sse')} />
                <span>SSE</span>
              </label>
              <label className="settings-radio">
                <input type="radio" name="protocol" value="streamable-http" checked={protocol === 'streamable-http'} onChange={() => setProtocol('streamable-http')} />
                <span>Streamable HTTP</span>
              </label>
            </div>
          </label>
        </div>

        <div className="settings-page__footer" style={{ marginTop: 'auto' }}>
          <button type="submit" className="theme-btn">确认</button>
          <button type="button" className="theme-btn theme-btn--cancel" onClick={onCancel}>取消</button>
        </div>
      </form>
    </div>
  );
}
