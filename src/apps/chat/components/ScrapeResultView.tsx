/**
 * ScrapeResultView — 网页抓取结果详情视图（Drawer 内嵌）
 *
 * Tidal Echo 风格：
 * - URL 标题行
 * - 元数据（标题/描述）
 * - Markdown 正文内容渲染
 */
import { FileText } from '@phosphor-icons/react';

interface ScrapeResultViewProps {
  /** tool 返回的 JSON string */
  rawOutput: string;
}

export default function ScrapeResultView({ rawOutput }: ScrapeResultViewProps) {
  let url = '';
  let content = '';
  let metadata: { title?: string; description?: string } | null = null;

  try {
    const parsed = JSON.parse(rawOutput);
    url = parsed.url || '';
    content = parsed.content || '';
    metadata = parsed.metadata || null;
  } catch {
    // 非 JSON 格式，以纯文本显示
  }

  return (
    <div style={{ padding: '4px 0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '0 4px' }}>
        <span style={{ fontSize: 15, flexShrink: 0, marginTop: 2 }}>
          <FileText size={18} weight="regular" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {metadata?.title && (
            <div style={{
              fontSize: 14, fontWeight: 600, color: 'var(--app-text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {metadata.title}
            </div>
          )}
          <div style={{
            fontSize: 11, color: 'var(--app-text-secondary)',
            opacity: 0.7, wordBreak: 'break-all', marginTop: 2,
          }}>
            {url}
          </div>
        </div>
      </div>

      {/* 元数据描述 */}
      {metadata?.description && (
        <div style={{
          fontSize: 12, color: 'var(--app-text-secondary)',
          padding: '0 4px', lineHeight: 1.4,
        }}>
          {metadata.description}
        </div>
      )}

      {/* 正文内容 */}
      {content ? (
        <div style={{
          background: 'var(--app-bg)',
          border: '1px solid var(--app-border)',
          borderRadius: 10, padding: 12,
          fontSize: 12, lineHeight: 1.6,
          color: 'var(--app-text)',
          maxHeight: 400, overflow: 'auto',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {content}
        </div>
      ) : (
        <pre style={{
          fontSize: 11, lineHeight: 1.5, color: 'var(--app-text-secondary)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          padding: '8px 4px', margin: 0,
        }}>
          {rawOutput}
        </pre>
      )}
    </div>
  );
}
