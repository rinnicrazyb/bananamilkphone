/**
 * ChatSearchPage — 智能体全局消息搜索
 *
 * 对标 RikkaHub MessageSearch：
 * - 搜索该智能体下所有对话的消息
 * - 显示对话标题 + 片段高亮 + 时间
 * - 点击跳转到对应对话+消息位置
 */
import { useState, useEffect, useCallback } from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { useNavigate, useParams } from 'react-router-dom';
import { useChatStore } from '../store/chat-store';
import { searchAllMessages } from '../../../services/chat-message-db';
import type { Message } from '../types';
import HighlightedText, { scrollToMessage } from '../components/HighlightedText';

export default function ChatSearchPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const conversations = useChatStore((s) => s.conversations);
  const agents = useChatStore((s) => s.agents);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);

  const agent = agents.find((a) => a.id === agentId);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const msgs = await searchAllMessages(q, 50);
      // 过滤：只保留该智能体对话的消息
      const agentConvIds = new Set(
        conversations.filter((c) => c.agentId === agentId).map((c) => c.id)
      );
      setResults(msgs.filter((m) => agentConvIds.has(m.conversationId)));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [agentId, conversations]);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const handleClick = (msg: Message) => {
    setActiveConversation(msg.conversationId);
    navigate(`/chat`, { replace: true });
    scrollToMessage(msg.id);
  };

  const getConvTitle = (convId: string) =>
    conversations.find((c) => c.id === convId)?.title || '未命名对话';

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="func-fullpage">
      <div className="func-fullpage__header">
        <button className="back-btn" onClick={() => navigate(-1)}>← 返回</button>
        <h2>搜索消息</h2>
      </div>
      <div className="func-fullpage__body" style={{ padding: '12px 16px' }}>
        {/* 搜索框 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--app-bg-card)', border: '1px solid var(--app-border)',
          borderRadius: 20, padding: '6px 12px', marginBottom: 12,
        }}>
          <MagnifyingGlass size={14} style={{ flexShrink: 0, color: 'var(--app-text-secondary)' }} />
          <input
            style={{
              flex: 1, minWidth: 0, border: 'none', outline: 'none',
              background: 'transparent', fontSize: 14, color: 'var(--app-text)',
              fontFamily: 'inherit',
            }}
            placeholder={agent ? `搜索与「${agent.name}」的消息...` : '搜索消息...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
              <X size={14} style={{ color: 'var(--app-text-secondary)' }} />
            </button>
          )}
        </div>

        {/* 状态 */}
        {searching && (
          <div style={{ textAlign: 'center', padding: 12, fontSize: 13, color: 'var(--app-text-secondary)' }}>
            搜索中...
          </div>
        )}

        {!searching && query.trim() && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, fontSize: 14, color: 'var(--app-text-secondary)' }}>
            未找到匹配消息
          </div>
        )}

        {!query.trim() && (
          <div style={{ textAlign: 'center', padding: 24, fontSize: 14, color: 'var(--app-text-secondary)' }}>
            输入关键词搜索 {agent ? `「${agent.name}」` : ''} 的所有对话
          </div>
        )}

        {/* 结果列表 */}
        {results.map((msg) => (
          <div
            key={msg.id}
            onClick={() => handleClick(msg)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              padding: '10px 12px', marginBottom: 6,
              background: 'var(--app-bg-card)', borderRadius: 8,
              border: '1px solid var(--app-border)', cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--app-primary)' }}>
              {getConvTitle(msg.conversationId)}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--app-text)' }}>
              <HighlightedText text={msg.content} query={query} maxLength={80} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--app-text-secondary)', display: 'flex', gap: 8 }}>
              <span>{msg.role === 'user' ? '用户' : '助手'}</span>
              <span>{formatTime(msg.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
