/**
 * SearchResultsView — 搜索结果详情视图（Drawer 内嵌）
 *
 * Tidal Echo 风格：
 * - 查询词标题
 * - AI answer 摘要卡片（Markdown）
 * - 图片行（可选）
 * - 结果卡片列表（SearchResultCard）
 */
import { Globe } from '@phosphor-icons/react';
import SearchResultCard from './SearchResultCard';

interface SearchResultsViewProps {
  query: string;
  /** tool 返回的 JSON string */
  rawOutput: string;
}

function openUrl(url: string) {
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export default function SearchResultsView({ query, rawOutput }: SearchResultsViewProps) {
  let answer: string | null = null;
  let items: Array<{ title: string; url: string; content: string }> = [];
  let images: string[] = [];

  let parsedRaw: any;
  try {
    parsedRaw = JSON.parse(rawOutput);
    if (parsedRaw.answer) answer = parsedRaw.answer;
    if (Array.isArray(parsedRaw.items)) items = parsedRaw.items;
    if (Array.isArray(parsedRaw.images)) images = parsedRaw.images;
    // 兼容旧格式：直接返回数组
    if (Array.isArray(parsedRaw)) items = parsedRaw;
  } catch {
    // 非 JSON 格式，以纯文本显示
  }

  return (
    <div style={{ padding: '4px 0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 查询标题 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
        <span style={{ fontSize: 15 }}><Globe size={18} weight="regular" /></span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-text)' }}>
          搜索: {query}
        </span>
        <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', marginLeft: 'auto' }}>
          {items.length} 条结果
        </span>
      </div>

      {/* AI answer 摘要 */}
      {answer && (
        <div style={{
          background: 'var(--app-secondary)',
          borderRadius: 10, padding: '10px 14px',
          fontSize: 12, lineHeight: 1.5,
          color: 'var(--app-text)',
          border: '1px solid var(--app-border)',
        }}>
          {answer}
        </div>
      )}

      {/* 图片行 */}
      {images.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, overflow: 'auto',
          paddingBottom: 4,
        }}>
          {images.map((imgUrl, i) => (
            <img
              key={i}
              src={imgUrl}
              alt=""
              onClick={() => openUrl(imgUrl)}
              style={{
                height: 100, borderRadius: 8, cursor: 'pointer',
                flexShrink: 0, objectFit: 'cover',
              }}
            />
          ))}
        </div>
      )}

      {/* 结果卡片列表 */}
      {items.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item, i) => (
            <SearchResultCard
              key={i}
              title={item.title}
              content={item.content}
              url={item.url}
            />
          ))}
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
