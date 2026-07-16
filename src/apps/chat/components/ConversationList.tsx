import { useState } from 'react';
import { PencilSimple, Trash, X } from '@phosphor-icons/react';
import { useChatStore } from '../store/chat-store';

export default function ConversationList() {
  const conversations = useChatStore((s) => s.conversations);
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
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="conv-panel">
      <div className="conv-panel__header">
        <h2>对话列表</h2>
        <button className="conv-panel__close" onClick={toggleConversationList}>
          <X size={18} />
        </button>
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
                {new Date(conv.updatedAt).toLocaleDateString('zh-CN', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
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
