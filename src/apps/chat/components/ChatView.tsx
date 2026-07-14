import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useEffect } from 'react';
import { useChatStore } from '../store/chat-store';
import type { Message } from '../types';

function MessageBubble({ msg }: { msg: Message }) {
  return (
    <div className={`chat-bubble chat-bubble--${msg.role}`}>
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
  const messages = useChatStore((s) =>
    activeConversationId ? s.messages[activeConversationId] || [] : []
  );
  const parentRef = useRef<HTMLDivElement>(null);

  // 按时间正序显示（最旧在上，最新在下）
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);

  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 10,
  });

  // 新消息时自动滚到底部
  const lastMsgId = messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (parentRef.current) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight;
    }
  }, [lastMsgId]);

  return (
    <div className="chat-view" ref={parentRef}>
      <div
        className="chat-view__inner"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const msg = sorted[virtualItem.index];
          if (!msg) return null;
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
