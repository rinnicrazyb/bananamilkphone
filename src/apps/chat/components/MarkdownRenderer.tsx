/**
 * Markdown/HTML 渲染器 — 基于 react-markdown + rehype
 *
 * - 纯文本 → 直接渲染
 * - Markdown → react-markdown 解析（GFM 表格/列表等）
 * - HTML → rehype-raw 透传 + rehype-sanitize（允许 style/class）
 * - 纯 HTML（无 Markdown）→ iframe 沙盒安全渲染
 */
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { useMemo, Children } from 'react';
import InteractiveHTML from './InteractiveHTML';

/** 检测是否仅含 HTML（无 Markdown 语法） */
function isPureHtml(text: string): boolean {
  // 有 HTML 标签
  if (!/<[a-z][\s\S]*?>/i.test(text)) return false;
  // 但没有任何 Markdown 语法（标题/粗体/列表/引用/代码/链接）
  if (/^#{1,6}\s/m.test(text)) return false;
  if (/\*\*|__|~~/.test(text)) return false;
  if (/```/.test(text)) return false;
  if (/^>\s|^[-*+]\s|^\d+\.\s/m.test(text)) return false;
  if (/\[.*?\]\(.*?\)/.test(text)) return false;
  return true;
}

/** 检测字符串是否包含 Markdown 或 HTML 语法 */
export function hasMarkdownOrHtml(text: string): boolean {
  if (!text) return false;
  if (/<[a-z][\s\S]*?>/i.test(text)) return true;
  if (/^#{1,6}\s/m.test(text)) return true;
  if (/\*\*|__|~~|(?<!\*)\*(?!\*)/.test(text)) return true;
  if (/\[.*?\]\(.*?\)/.test(text)) return true;
  if (/```|`[^`]+`/.test(text)) return true;
  if (/^>\s|^[-*+]\s|^\d+\.\s|---|\|/m.test(text)) return true;
  if (/^\|[-:| ]+\|$/m.test(text)) return true;
  if (/^[-*_]{3,}\s*$/m.test(text)) return true;
  return false;
}

// 自定义 rehype-sanitize schema：允许 style 和 class 属性
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': ['style', 'className', 'class', 'id', 'width', 'height'],
  },
};

interface MarkdownRendererProps {
  content: string;
  inBubble?: boolean;
}

export default function MarkdownRenderer({ content, inBubble }: MarkdownRendererProps) {
  const isFormatted = useMemo(() => hasMarkdownOrHtml(content), [content]);

  if (!isFormatted) {
    if (inBubble) return <>{content}</>;
    return <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>;
  }

  // 纯 HTML（无 Markdown）→ iframe 沙盒安全渲染
  if (isPureHtml(content)) {
    return <InteractiveHTML html={content} />;
  }

  return (
    <div className="markdown-content" style={{ lineHeight: 1.6 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeRaw], [rehypeSanitize, sanitizeSchema]]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--app-primary)' }}>
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img src={src} alt={alt || ''} style={{ maxWidth: '100%', borderRadius: 8 }} />
          ),
          pre: ({ children }) => {
            // 检测 language-html 代码块 → InteractiveHTML
            const code = Children.toArray(children)[0] as React.ReactElement<{ className?: string; children?: unknown }> | undefined;
            if (code?.props && typeof code.props.className === 'string' && code.props.className.includes('language-html')) {
              const htmlContent = String(code.props.children || '');
              return <InteractiveHTML html={htmlContent} />;
            }
            return (
              <pre style={{ overflowX: 'auto', padding: 12, background: 'var(--app-secondary)', borderRadius: 8, fontSize: 13 }}>
                {children}
              </pre>
            );
          },
          code: ({ className, children }) => {
            if (className) return <code className={className}>{children}</code>;
            return (
              <code style={{ background: 'var(--app-secondary)', padding: '2px 6px', borderRadius: 4, fontSize: '0.9em' }}>
                {children}
              </code>
            );
          },
          // 表格：修复无边框问题
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '8px 0' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th style={{ border: '1px solid var(--app-border)', padding: '6px 10px', background: 'var(--app-secondary)', fontWeight: 600, textAlign: 'left' }}>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td style={{ border: '1px solid var(--app-border)', padding: '6px 10px' }}>
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
