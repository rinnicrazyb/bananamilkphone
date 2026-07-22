/**
 * SearchResultCard — 搜索结果卡片
 *
 * Tidal Echo 风格：
 * - 统一 globe icon（不加载网站 favicon）
 * - 标题 + 摘要（2行截断）+ URL（小字灰色）
 * - 整张卡片可点击跳转
 */
import { Globe } from '@phosphor-icons/react';

interface SearchResultCardProps {
  title: string;
  content: string;
  url: string;
}

function openUrl(url: string) {
  // Capacitor 或浏览器环境兜底
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export default function SearchResultCard({ title, content, url }: SearchResultCardProps) {
  return (
    <div
      onClick={() => openUrl(url)}
      style={{
        display: 'flex',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 10,
        background: 'var(--app-secondary)',
        cursor: 'pointer',
        transition: 'background 0.12s',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--app-border)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--app-secondary)')}
    >
      {/* 统一图标 — 不加载网站 favicon */}
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--app-primary)',
        color: '#fff',
        fontSize: 14,
      }}>
        <Globe size={16} weight="bold" />
      </div>

      {/* 文字区 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: 'var(--app-text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
        {content && (
          <div style={{
            fontSize: 12, lineHeight: 1.4,
            color: 'var(--app-text-secondary)',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            {content}
          </div>
        )}
        <div style={{
          fontSize: 11,
          color: 'var(--app-text-secondary)',
          opacity: 0.6,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginTop: 1,
        }}>
          {url}
        </div>
      </div>
    </div>
  );
}
