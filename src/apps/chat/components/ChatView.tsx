import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useChatStore } from '../store/chat-store';
import type { Message } from '../types';

function MessageBubble({ msg }: { msg: Message }) {
  return (
    <div
      id={`msg-${msg.id}`}
      className={`chat-bubble chat-bubble--${msg.role}`}
    >
      {msg.reasoning && (
        <details className="chat-bubble__reasoning">
          <summary>思考链</summary>
          <pre>{msg.reasoning}</pre>
        </details>
      )}
      <div className="chat-bubble__content">{msg.content}</div>
      <div className="chat-bubble__meta">
        <span className="chat-bubble__time">
          {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        {msg.role === 'user' && (
          <span className={`chat-bubble__status chat-bubble__status--${msg.status}`}>
            {msg.status === 'sending' ? '⏳' : msg.status === 'sent' ? '✓' : msg.status === 'read' ? '✓✓' : '⚠️'}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ChatView() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const rawMessages = useChatStore((s) =>
    activeConversationId ? s.messages[activeConversationId] : undefined
  );
  const messages = rawMessages ?? ([] as Message[]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const sorted = useMemo(
    () => [...messages].sort((a, b) => a.timestamp - b.timestamp),
    [messages]
  );

  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 10,
  });

  // Infinite scroll: IntersectionObserver on top sentinel
  const handleLoadMore = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    // 预留：从 SQLite 分页加载更早消息
    console.log('[ChatView] Load more messages (stub)');
    // 模拟加载完成后重置
    setTimeout(() => { loadingRef.current = false; }, 500);
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || sorted.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          handleLoadMore();
        }
      },
      { root: scrollRef.current, threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sorted.length, handleLoadMore]);

  // 新消息时自动滚到底部
  const lastMsgId = messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (scrollRef.current && sorted.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lastMsgId, sorted.length]);

  if (sorted.length === 0) {
    return (
      <div className="chat-view" ref={scrollRef}>
        <div className="chat-view__empty">开始对话吧</div>
      </div>
    );
  }

  return (
    <div className="chat-view" ref={scrollRef}>
      {/* 顶部哨兵：滚动到顶部时触发加载更多 */}
      <div ref={sentinelRef} style={{ height: 1, width: '100%' }} />
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const msg = sorted[virtualItem.index];
          return (
            <div
              key={msg.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <MessageBubble msg={msg} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
