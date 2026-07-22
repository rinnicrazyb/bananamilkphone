/**
 * Markdown/HTML 渲染器 — 基于 react-markdown + rehype + highlight.js
 *
 * - 纯文本 → 直接渲染
 * - Markdown → react-markdown 解析（GFM 表格/列表等）
 * - HTML → rehype-raw 透传 + rehype-sanitize
 * - 纯 HTML → iframe 沙盒渲染
 * - 代码块 → hljs 语法高亮 + 复制按钮（JSX 渲染，不被 React 覆盖）
 * - language-html 代码块 → 流式时显示代码，完成后渲染为 InteractiveHTML
 */
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { useMemo, useState, useCallback, useRef, Children } from 'react';
import InteractiveHTML from './InteractiveHTML';
import { highlightCode } from '../../../services/highlight/index';

/** 检测是否仅含 HTML（无 Markdown 语法） */
function isPureHtml(text: string): boolean {
  if (!/<[a-z][\s\S]*?>/i.test(text)) return false;
  if (/^#{1,6}\s/m.test(text)) return false;
  if (/\*\*|__|~~/.test(text)) return false;
  if (/```/.test(text)) return false;
  if (/^>\s|^[-*+]\s|^\d+\.\s/m.test(text)) return false;
  if (/\[.*?\]\(.*?\)/.test(text)) return false;
  return true;
}

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

const sanitizeSchema = {
  ...defaultSchema,
  attributes: { ...defaultSchema.attributes, '*': ['style', 'className', 'class', 'id', 'width', 'height'] },
};

interface MarkdownRendererProps {
  content: string;
  inBubble?: boolean;
  /** 消息是否正在流式生成中 */
  isStreaming?: boolean;
}

/** 复制按钮组件 — JSX 渲染，不被 React Virtual DOM 覆盖 */
function CopyButton({ getCode }: { getCode: () => string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    const text = getCode();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }, [getCode]);

  return (
    <button
      className="code-copy-btn"
      title="复制代码"
      onPointerUp={handleCopy}
      style={{ position: 'absolute', top: 6, right: 6, zIndex: 1 }}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66 77.66l-128 128a8 8 0 0 1-11.32 0l-56-56a8 8 0 0 1 11.32-11.32L96 188.69 218.34 66.34a8 8 0 0 1 11.32 11.32Z"/></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M216 32H88a8 8 0 0 0-8 8v40H40a8 8 0 0 0-8 8v128a8 8 0 0 0 8 8h128a8 8 0 0 0 8-8v-40h40a8 8 0 0 0 8-8V40a8 8 0 0 0-8-8Zm-8 128h-32V88a8 8 0 0 0-8-8H96V48h112Z"/></svg>
      )}
    </button>
  );
}

/** 代码块组件 — 带语法高亮和复制按钮（JSX 内渲染） */
function CodeBlock({ className, children, isStreaming }: { className?: string; children: React.ReactNode; isStreaming?: boolean }) {
  const codeRef = useRef<HTMLElement>(null);
  const codeText = useMemo(() => {
    // 提取纯文本内容（从 children 或 ref）
    if (typeof children === 'string') return children.replace(/\n$/, '');
    return '';
  }, [children]);

  const lang = useMemo(() => {
    if (!className) return '';
    return className.replace('language-', '');
  }, [className]);

  const highlighted = useMemo(() => {
    if (!lang) return null;
    if (lang === 'html' && isStreaming) return null;
    return highlightCode(codeText, lang);
  }, [codeText, lang, isStreaming]);

  if (className && highlighted) {
    return (
      <code ref={codeRef} className={`${className} hljs`} style={{ position: 'relative' }} dangerouslySetInnerHTML={{ __html: highlighted }} />
    );
  }
  if (className) return <code className={className}>{children}</code>;
  return <code style={{ background: 'var(--app-secondary)', padding: '2px 6px', borderRadius: 4, fontSize: '0.9em' }}>{children}</code>;
}

export default function MarkdownRenderer({ content, inBubble, isStreaming }: MarkdownRendererProps) {
  const isFormatted = useMemo(() => hasMarkdownOrHtml(content), [content]);

  if (!isFormatted) {
    if (inBubble) return <>{content}</>;
    return <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>;
  }

  if (isPureHtml(content)) {
    return <InteractiveHTML html={content} />;
  }

  return (
    <div className="markdown-content" style={{ lineHeight: 1.6, ...(isStreaming ? { animation: 'stream-fade-in 0.25s ease-out' } : {}) }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeRaw], [rehypeSanitize, sanitizeSchema]]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--app-primary)' }}>{children}</a>
          ),
          img: ({ src, alt }) => (
            <img src={src} alt={alt || ''} style={{ maxWidth: '100%', borderRadius: 8 }} />
          ),
          blockquote: ({ children }) => (
            <blockquote style={{ borderLeft: '3px solid var(--app-primary)', paddingLeft: 12, margin: '8px 0', color: 'var(--app-text-secondary)', fontStyle: 'italic' }}>{children}</blockquote>
          ),
          hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--app-border)', margin: '12px 0', opacity: 0.5 }} />,
          pre: ({ children }) => {
            const codeChild = Children.toArray(children)[0] as React.ReactElement<{ className?: string; children?: unknown }> | undefined;
            const isHtml = codeChild?.props && typeof codeChild.props.className === 'string' && codeChild.props.className.includes('language-html');
            const preRef = useRef<HTMLPreElement>(null);

            if (isHtml) {
              const htmlContent = String(codeChild.props.children || '');
              if (isStreaming) {
                return (
                  <pre style={{ position: 'relative', overflowX: 'auto', padding: 12, background: 'var(--app-secondary)', borderRadius: 8, fontSize: 13, color: 'var(--app-text)' }}>
                    <code className="language-html">{htmlContent}</code>
                    <div style={{ position: 'absolute', top: 6, right: 6, fontSize: 10, color: 'var(--app-text-secondary)' }}>生成中...</div>
                  </pre>
                );
              }
              return <InteractiveHTML html={htmlContent} />;
            }

            return (
              <pre ref={preRef} className="code-block-wrapper" style={{ position: 'relative', overflowX: 'auto', padding: 12, background: 'var(--app-secondary)', borderRadius: 8, fontSize: 13, color: 'var(--app-text)' }}>
                {children}
                <CopyButton getCode={() => preRef.current?.querySelector('code')?.textContent || ''} />
              </pre>
            );
          },
          code: ({ className, children }) => {
            return <CodeBlock className={className} children={children} isStreaming={isStreaming} />;
          },
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '8px 0' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th style={{ border: '1px solid var(--app-border)', padding: '6px 10px', background: 'var(--app-secondary)', fontWeight: 600, textAlign: 'left' }}>{children}</th>
          ),
          td: ({ children }) => (
            <td style={{ border: '1px solid var(--app-border)', padding: '6px 10px' }}>{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
