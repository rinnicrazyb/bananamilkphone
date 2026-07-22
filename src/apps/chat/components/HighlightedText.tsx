/**
 * HighlightedText — 搜索高亮共享组件
 *
 * 输入文本 + 查询词 → 截取匹配词附近的上下文片段 + <mark> 包裹所有匹配
 * 两处搜索（对话内/全局）复用。
 */
import { useMemo } from 'react';

interface Props {
  text: string;
  query: string;
  /** 截取片段的最大长度（字符数，默认 60） */
  maxLength?: number;
}

export default function HighlightedText({ text, query, maxLength = 60 }: Props) {
  const snippet = useMemo(() => {
    if (!query.trim()) return text.slice(0, maxLength);

    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    const idx = lower.indexOf(q);

    if (idx === -1) return text.slice(0, maxLength);

    // 截取匹配词前后的上下文
    const half = Math.floor((maxLength - q.length) / 2);
    let start = Math.max(0, idx - half);
    let end = Math.min(text.length, idx + q.length + half);

    // 微调确保不截断单词（在空格处切）
    if (start > 0 && text[start] !== ' ') {
      const spaceBefore = text.lastIndexOf(' ', start);
      if (spaceBefore > start - 10) start = spaceBefore + 1;
    }
    if (end < text.length && text[end] !== ' ') {
      const spaceAfter = text.indexOf(' ', end);
      if (spaceAfter < end + 10) end = spaceAfter;
    }

    let s = text.slice(start, end);
    if (start > 0) s = '...' + s;
    if (end < text.length) s = s + '...';
    return s;
  }, [text, query, maxLength]);

  if (!query.trim()) return <span>{snippet}</span>;

  // 将 snippet 按查询词拆分，匹配部分用 <mark> 包裹
  const lowerSnippet = snippet.toLowerCase();
  const q = query.toLowerCase();
  const parts: { text: string; highlight: boolean }[] = [];
  let pos = 0;

  while (pos < snippet.length) {
    const idx = lowerSnippet.indexOf(q, pos);
    if (idx === -1) {
      parts.push({ text: snippet.slice(pos), highlight: false });
      break;
    }
    if (idx > pos) {
      parts.push({ text: snippet.slice(pos, idx), highlight: false });
    }
    parts.push({ text: snippet.slice(idx, idx + q.length), highlight: true });
    pos = idx + q.length;
  }

  return (
    <span>
      {parts.map((p, i) =>
        p.highlight ? (
          <mark key={i} className="search-highlight">{p.text}</mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  );
}

/** 滚动到消息位置（轮询直到元素出现，最多等3秒） */
export function scrollToMessage(msgId: string, timeoutMs = 3000): void {
  const start = Date.now();
  const tryScroll = () => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (Date.now() - start < timeoutMs) requestAnimationFrame(tryScroll);
  };
  requestAnimationFrame(tryScroll);
}
