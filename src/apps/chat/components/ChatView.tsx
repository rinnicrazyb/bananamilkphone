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
  const scrollRef = useRef<HTMLDivElement>(null);

  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);

  // 新消息自动滚到底
  const lastMsgId = messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lastMsgId]);

  return (
    <div className="chat-view" ref={scrollRef}>
      {sorted.length === 0 && (
        <div className="chat-view__empty">
          开始对话吧
        </div>
      )}
      {sorted.map((msg) => (
        <MessageBubble key={msg.id} msg={msg} />
      ))}
    </div>
  );
}
