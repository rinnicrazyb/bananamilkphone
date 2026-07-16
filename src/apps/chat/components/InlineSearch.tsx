import { useState } from 'react';
import { MagnifyingGlass, CaretUp, CaretDown, X } from '@phosphor-icons/react';
import { useChatStore } from '../store/chat-store';

interface InlineSearchProps {
  conversationId: string;
  onClose: () => void;
}

export default function InlineSearch({ conversationId, onClose }: InlineSearchProps) {
  const [query, setQuery] = useState('');
  // 稳定 selector：直接返回数组或 undefined，不创建新引用
  const rawMessages = useChatStore((s) => s.messages[conversationId]);
  const messages = rawMessages ?? [];
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
    const msgId = messages[matches[next]]?.id;
    if (msgId) {
      const el = document.getElementById(`msg-${msgId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="inline-search">
      <div className="inline-search__input-wrap">
        <span className="inline-search__icon"><MagnifyingGlass size={16} /></span>
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
              <CaretUp size={14} />
            </button>
            <button className="inline-search__nav" onClick={() => goToMatch(1)}>
              <CaretDown size={14} />
            </button>
          </>
        )}
      </div>
      <button className="inline-search__close" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}
