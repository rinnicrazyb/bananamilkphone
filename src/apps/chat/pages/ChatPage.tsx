import { useChatStore } from '../store/chat-store';
import AgentList from '../components/AgentList';
import ChatView from '../components/ChatView';
import ChatInput from '../components/ChatInput';

export default function ChatPage() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  if (activeConv) {
    return (
      <div className="chat-page">
        {/* 聊天界面 */}
        <div className="chat-page__header">
          <button
            className="back-btn"
            onClick={() => setActiveConversation(null)}
          >
            ← 返回
          </button>
          <h1>{activeConv.title}</h1>
          <div className="chat-page__header-right">
            <button className="chat-page__search-btn">🔍</button>
            <button className="chat-page__menu-btn">⋯</button>
          </div>
        </div>
        <ChatView />
        <ChatInput />
      </div>
    );
  }

  return <AgentList />;
}
