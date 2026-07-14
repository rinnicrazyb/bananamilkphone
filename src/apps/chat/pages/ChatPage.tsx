import { useRef, useCallback } from 'react';
import { useChatStore } from '../store/chat-store';
import AgentList from '../components/AgentList';
import ChatView from '../components/ChatView';
import ChatInput from '../components/ChatInput';
import ConversationList from '../components/ConversationList';
import AgentSettingsPanel from '../components/AgentSettings';

export default function ChatPage() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const showConversationList = useChatStore((s) => s.showConversationList);
  const toggleConversationList = useChatStore((s) => s.toggleConversationList);
  const showAgentSettings = useChatStore((s) => s.showAgentSettings);
  const setShowAgentSettings = useChatStore((s) => s.setShowAgentSettings);

  const touchStartX = useRef(0);

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      // 右滑超过 60px 打开对话列表
      if (dx > 60 && !showConversationList) {
        toggleConversationList();
      }
    },
    [showConversationList, toggleConversationList]
  );

  if (activeConv) {
    return (
      <div className="chat-page">
        <div
          className="chat-page__main"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="chat-page__header">
            <button
              className="back-btn"
              onClick={() => setActiveConversation(null)}
            >
              ← 返回
            </button>
            <h1>{activeConv.title}</h1>
            <div className="chat-page__header-right">
              <button
                className="chat-page__icon-btn"
                onClick={toggleConversationList}
                title="对话列表"
              >
                ☰
              </button>
              <button
                className="chat-page__icon-btn"
                onClick={() => setShowAgentSettings(true)}
                title="智能体设定"
              >
                ⋯
              </button>
            </div>
          </div>
          <ChatView />
          <ChatInput />
        </div>

        {showConversationList && (
          <div className="chat-page__overlay" onClick={toggleConversationList}>
            <div
              className="chat-page__panel"
              onClick={(e) => e.stopPropagation()}
            >
              <ConversationList />
            </div>
          </div>
        )}

        {showAgentSettings && <AgentSettingsPanel />}
      </div>
    );
  }

  return <AgentList />;
}
