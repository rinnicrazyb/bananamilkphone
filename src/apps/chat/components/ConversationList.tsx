import { useState } from 'react';
import { PencilSimple, Trash, X, MagnifyingGlass } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/chat-store';

export default function ConversationList() {
  const navigate = useNavigate();
  const conversations = useChatStore((s) => s.conversations);
  const getCurrentMessages = useChatStore((s) => s.getCurrentMessages);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const renameConversation = useChatStore((s) => s.renameConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const toggleConversationList = useChatStore((s) => s.toggleConversationList);
  const addConversation = useChatStore((s) => s.addConversation);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // 从当前活跃对话中获取智能体 ID
  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const currentAgentId = activeConv?.agentId;

  // 只显示当前智能体的对话
  const agentConversations = conversations.filter(
    (c) => c.agentId === currentAgentId
  );

  const handleStartRename = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const handleConfirmRename = () => {
    if (editingId && editTitle.trim()) {
      renameConversation(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleNewConversation = () => {
    if (!currentAgentId) return;
    const conv = {
      id: `conv-${Date.now()}`,
      agentId: currentAgentId,
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    addConversation(conv);
    setActiveConversation(conv.id);
    toggleConversationList();
  };

  // 按搜索过滤 + 按时间排序
  const filtered = agentConversations
    .filter((c) =>
      searchQuery
        ? c.title.toLowerCase().includes(searchQuery.toLowerCase())
        : true
    )
    .sort((a, b) => (b.updatedAt || getLastMsgTime(b.id)) - (a.updatedAt || getLastMsgTime(a.id)));

  function getLastMsgTime(convId: string): number {
    const msgs = getCurrentMessages(convId);
    if (!msgs || msgs.length === 0) return 0;
    return msgs[msgs.length - 1].timestamp;
  }

  function formatConvTime(convId: string): string {
    const conv = agentConversations.find((c) => c.id === convId);
    const lastTime = getLastMsgTime(convId);
    const ts = lastTime > 0 ? lastTime : (conv?.createdAt ?? Date.now());
    return new Date(ts).toLocaleDateString('zh-CN', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div className="conv-panel">
      <div className="conv-panel__header">
        <h2>对话列表</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          {currentAgentId && (
            <button
              className="conv-panel__close"
              onClick={() => { navigate(`/chat/search/${currentAgentId}`); toggleConversationList(); }}
              title="搜索消息"
            >
              <MagnifyingGlass size={18} />
            </button>
          )}
          <button className="conv-panel__close" onClick={toggleConversationList}>
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="conv-panel__search">
        <input
          type="text"
          placeholder="搜索对话..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <button className="conv-panel__new" onClick={handleNewConversation}>
        ＋ 新对话
      </button>

      <div className="conv-panel__list">
        {filtered.map((conv) => (
          <div
            key={conv.id}
            className={`conv-item ${conv.id === activeConversationId ? 'conv-item--active' : ''}`}
          >
            <div
              className="conv-item__main"
              onClick={() => {
                setActiveConversation(conv.id);
                toggleConversationList();
              }}
            >
              {editingId === conv.id ? (
                <input
                  className="conv-item__rename-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={handleConfirmRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="conv-item__title">{conv.title}</span>
              )}
              <span className="conv-item__time">
                {formatConvTime(conv.id)}
              </span>
            </div>
            <div className="conv-item__actions">
              <button
                className="conv-item__btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartRename(conv.id, conv.title);
                }}
                title="重命名"
              >
                <PencilSimple size={16} />
              </button>
              <button
                className="conv-item__btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(conv.id);
                }}
                title="删除"
              >
                <Trash size={16} />
              </button>
            </div>

            {showDeleteConfirm === conv.id && (
              <div className="conv-item__confirm">
                <span>确认删除该对话？</span>
                <div className="conv-item__confirm-btns">
                  <button
                    className="conv-item__btn conv-item__btn--danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                      setShowDeleteConfirm(null);
                    }}
                  >
                    删除
                  </button>
                  <button
                    className="conv-item__btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(null);
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
