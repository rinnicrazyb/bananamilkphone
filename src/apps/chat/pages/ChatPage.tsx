import { useRef, useCallback, useState } from 'react';
import { useChatStore } from '../store/chat-store';
import AgentList from '../components/AgentList';
import ChatView from '../components/ChatView';
import ChatInput from '../components/ChatInput';
import ConversationList from '../components/ConversationList';
import AgentSettingsPanel from '../components/AgentSettings';
import FunctionBox from '../components/FunctionBox';
import InlineSearch from '../components/InlineSearch';
import BeautifyPanel from '../components/BeautifyPanel';
import ChatSettingsPanel from '../components/ChatSettingsPanel';

export default function ChatPage() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const showConversationList = useChatStore((s) => s.showConversationList);
  const toggleConversationList = useChatStore((s) => s.toggleConversationList);
  const showAgentSettings = useChatStore((s) => s.showAgentSettings);
  const setShowAgentSettings = useChatStore((s) => s.setShowAgentSettings);
  const [showFunctionBox, setShowFunctionBox] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showBeautify, setShowBeautify] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);

  const touchStartX = useRef(0);

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
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
            {!showSearch ? (
              <>
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
                    onClick={() => setShowSearch(true)}
                    title="搜索"
                  >
                    🔍
                  </button>
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
              </>
            ) : (
              <InlineSearch
                conversationId={activeConv.id}
                onClose={() => setShowSearch(false)}
              />
            )}
          </div>
          <ChatView />
          <ChatInput onPlusClick={() => setShowFunctionBox(true)} />
        </div>

        {showConversationList && (
          <div className="chat-page__overlay" onClick={toggleConversationList}>
            <div className="chat-page__panel" onClick={(e) => e.stopPropagation()}>
              <ConversationList />
            </div>
          </div>
        )}

        {showAgentSettings && <AgentSettingsPanel />}

        {showFunctionBox && (
          <FunctionBox
            onClose={() => setShowFunctionBox(false)}
            onOpenSettings={() => setShowChatSettings(true)}
            onOpenBeautify={() => setShowBeautify(true)}
          />
        )}

        {showBeautify && <BeautifyPanel onClose={() => setShowBeautify(false)} />}

        {showChatSettings && <ChatSettingsPanel onClose={() => setShowChatSettings(false)} />}
      </div>
    );
  }

  return <AgentList />;
}
