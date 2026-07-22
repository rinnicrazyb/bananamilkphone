import { useRef, useCallback, useState } from 'react';
import { MagnifyingGlass, List, DotsThreeVertical, CaretLeft } from '@phosphor-icons/react';
import { useChatStore } from '../store/chat-store';
import AgentList from '../components/AgentList';
import ChatView from '../components/ChatView';
import ChatInput from '../components/ChatInput';
import ConversationList from '../components/ConversationList';
import FunctionBox from '../components/FunctionBox';
import MemoryPage from './MemoryPage';
import StubPage from './StubPage';
import MCPPage from './MCPPage';
import WebSearchPage from './WebSearchPage';

import InlineSearch from '../components/InlineSearch';
import ChatSettingsPage from './ChatSettingsPage';
import BeautifyPage from './BeautifyPage';
import ContextPreviewPage from './ContextPreviewPage';
import AgentSettingsPage from './AgentSettingsPage';

type FuncPage = 'settings' | 'beautify' | 'context' | 'memory' | 'mcp' | 'websearch' | 'active' | 'thinking' | null;

export default function ChatPage() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const agents = useChatStore((s) => s.agents);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const showConversationList = useChatStore((s) => s.showConversationList);
  const toggleConversationList = useChatStore((s) => s.toggleConversationList);
  const showAgentSettings = useChatStore((s) => s.showAgentSettings);
  const setShowAgentSettings = useChatStore((s) => s.setShowAgentSettings);
  const [showFunctionBox, setShowFunctionBox] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [funcPage, setFuncPage] = useState<FuncPage>(null);

  const touchStartX = useRef(0);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const currentAgent = agents.find((a) => a.id === activeConv?.agentId);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      // 代码块区域不触发右滑（防止在代码块内横向滚动时误触面板）
      const target = e.target as HTMLElement;
      if (target.closest('pre') || target.closest('code')) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      if (dx > 60 && !showConversationList) {
        toggleConversationList();
      }
    },
    [showConversationList, toggleConversationList]
  );

  const renderFuncPage = () => {
    const page = (() => {
      switch (funcPage) {
        case 'settings': return <ChatSettingsPage onBack={() => setFuncPage(null)} />;
        case 'beautify': return <BeautifyPage onBack={() => setFuncPage(null)} />;
        case 'context': return <ContextPreviewPage onBack={() => setFuncPage(null)} />;
        case 'memory': return <MemoryPage onBack={() => setFuncPage(null)} />;
        case 'mcp': return <MCPPage onBack={() => setFuncPage(null)} />;
        case 'websearch': return <WebSearchPage onBack={() => setFuncPage(null)} />;
        case 'active': return <StubPage onBack={() => setFuncPage(null)} title="主动消息" description="智能体可根据事件触发主动发起对话。该功能将在后续版本实现。" />;
        case 'thinking': return <StubPage onBack={() => setFuncPage(null)} title="思考强度" description="思考强度控制需模型供应商支持 reasoning_effort 参数，请在智能体设定中配置。" />;
        default: return null;
      }
    })();
    return page ? <div className="funcpage-overlay">{page}</div> : null;
  };

  const handleFuncSelect = useCallback((id: string) => {
    setFuncPage(id as FuncPage);
  }, []);

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
                <button className="back-btn" onClick={() => setActiveConversation(null)}><CaretLeft size={18} /></button>
                <h1>{currentAgent?.name ?? activeConv.title}</h1>
                <div className="chat-page__header-right">
                  <button className="chat-page__icon-btn" onClick={() => setShowSearch(true)} title="搜索"><MagnifyingGlass size={20} /></button>
                  <button className="chat-page__icon-btn" onClick={toggleConversationList} title="对话列表"><List size={20} /></button>
                  <button className="chat-page__icon-btn" onClick={() => setShowAgentSettings(true)} title="智能体设定"><DotsThreeVertical size={20} /></button>
                </div>
              </>
            ) : (
              <InlineSearch conversationId={activeConv.id} onClose={() => setShowSearch(false)} />
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

        {showAgentSettings && (
          <div className="funcpage-overlay">
            <AgentSettingsPage onBack={() => setShowAgentSettings(false)} />
          </div>
        )}

        {showFunctionBox && (
          <FunctionBox onClose={() => setShowFunctionBox(false)} onSelect={handleFuncSelect} />
        )}

        {renderFuncPage()}
      </div>
    );
  }

  return <AgentList />;
}
