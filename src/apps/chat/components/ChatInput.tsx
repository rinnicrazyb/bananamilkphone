import { useState, useRef } from 'react';
import { useChatStore } from '../store/chat-store';
import { useSendMessage } from '../../../hooks/use-send-message';

export default function ChatInput() {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const addMessage = useChatStore((s) => s.addMessage);
  const { sendMessage, abort } = useSendMessage();
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || !activeConversationId || sending) return;

    const msg = {
      id: `msg-${Date.now()}`,
      conversationId: activeConversationId,
      role: 'user' as const,
      content,
      timestamp: Date.now(),
      status: 'sent' as const,
    };
    addMessage(activeConversationId, msg);
    setText('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    setSending(true);
    await sendMessage(activeConversationId, content);
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  };

  return (
    <div className="chat-input">
      <div className="chat-input__plus">
        <span>+</span>
      </div>
      <textarea
        ref={inputRef}
        className="chat-input__field"
        placeholder="输入消息..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        rows={1}
      />
      {sending ? (
        <button className="chat-input__send chat-input__send--stop" onClick={abort}>
          ■ 停止
        </button>
      ) : (
        <button
          className="chat-input__send"
          onClick={handleSend}
          disabled={!text.trim()}
        >
          发送
        </button>
      )}
    </div>
  );
}
