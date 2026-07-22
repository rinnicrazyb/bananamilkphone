/**
 * InlineSearch — 对话内搜索（替换顶栏）
 *
 * 对标 RikkaHub ChatListPreview：
 * - 搜索当前对话的全部消息（SQLite）
 * - 结果显示为卡片列表（片段+高亮+时间）
 * - 点击跳转到目标消息位置
 */
import { useState, useEffect, useCallback } from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { searchConversationMessages } from '../../../services/chat-message-db';
import type { Message } from '../types';
import HighlightedText, { scrollToMessage } from './HighlightedText';

interface Props {
  conversationId: string;
  onClose: () => void;
}

export default function InlineSearch({ conversationId, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const msgs = await searchConversationMessages(conversationId, q);
      setResults(msgs);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [conversationId]);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const handleJump = (msgId: string) => {
    onClose();
    scrollToMessage(msgId);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 搜索栏 */}
      <div className="inline-search">
        <div className="inline-search__input-wrap">
          <span className="inline-search__icon"><MagnifyingGlass size={14} /></span>
          <input
            className="inline-search__input"
            placeholder="搜索本对话..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {searching && (
            <span style={{ fontSize: 10, color: 'var(--app-text-secondary)' }}>...</span>
          )}
        </div>
        <button className="inline-search__close" onClick={onClose} title="关闭搜索">
          <X size={16} />
        </button>
      </div>

      {/* 结果卡片列表 */}
      {results.length > 0 && (
        <div className="inline-search__results">
          {results.map((msg) => (
            <div
              key={msg.id}
              className={`inline-search__card ${msg.role === 'user' ? 'inline-search__card--user' : ''}`}
              onClick={() => handleJump(msg.id)}
            >
              <div className="inline-search__card-text">
                <HighlightedText text={msg.content} query={query} maxLength={80} />
              </div>
              <div className="inline-search__card-time">{formatTime(msg.timestamp)}</div>
            </div>
          ))}
        </div>
      )}

      {query.trim() && !searching && results.length === 0 && (
        <div className="inline-search__empty">未找到匹配消息</div>
      )}
    </div>
  );
}
