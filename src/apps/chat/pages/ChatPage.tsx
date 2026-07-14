import { useChatStore } from '../store/chat-store';
import AgentList from '../components/AgentList';
import ChatView from '../components/ChatView';
import ChatInput from '../components/ChatInput';
import ConversationList from '../components/ConversationList';

export default function ChatPage() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const showConversationList = useChatStore((s) => s.showConversationList);
  const toggleConversationList = useChatStore((s) => s.toggleConversationList);

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  if (activeConv) {
    return (
      <div className="chat-page">
        {/* 聊天界面主体 */}
        <div className="chat-page__main">
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
            </div>
          </div>
          <ChatView />
          <ChatInput />
        </div>

        {/* 右滑出对话列表面板 */}
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
      </div>
    );
  }

  return <AgentList />;
}
