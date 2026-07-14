import { useState } from 'react';
import { useChatStore } from '../store/chat-store';

interface InlineSearchProps {
  conversationId: string;
  onClose: () => void;
}

export default function InlineSearch({ conversationId, onClose }: InlineSearchProps) {
  const [query, setQuery] = useState('');
  const messages = useChatStore((s) => s.messages[conversationId] || []);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [matches, setMatches] = useState<number[]>([]);

  const handleSearch = (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setMatches([]);
      setCurrentMatch(0);
      return;
    }
    const lower = q.toLowerCase();
    const found: number[] = [];
    messages.forEach((msg, idx) => {
      if (msg.content.toLowerCase().includes(lower)) {
        found.push(idx);
      }
    });
    setMatches(found);
    setCurrentMatch(found.length > 0 ? 0 : -1);
  };

  const goToMatch = (dir: 1 | -1) => {
    if (matches.length === 0) return;
    const next = (currentMatch + dir + matches.length) % matches.length;
    setCurrentMatch(next);
    // 滚动到匹配的消息 — 用 data-msg-id 定位
    const msgId = messages[matches[next]]?.id;
    if (msgId) {
      const el = document.getElementById(`msg-${msgId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="inline-search">
      <div className="inline-search__input-wrap">
        <span className="inline-search__icon">🔍</span>
        <input
          type="text"
          className="inline-search__input"
          placeholder="搜索本对话..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          autoFocus
        />
        {matches.length > 0 && (
          <span className="inline-search__count">
            {currentMatch + 1}/{matches.length}
          </span>
        )}
        {matches.length > 0 && (
          <>
            <button className="inline-search__nav" onClick={() => goToMatch(-1)}>
              ▲
            </button>
            <button className="inline-search__nav" onClick={() => goToMatch(1)}>
              ▼
            </button>
          </>
        )}
      </div>
      <button className="inline-search__close" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
