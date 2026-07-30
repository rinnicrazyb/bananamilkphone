import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash, X, CaretLeft } from '@phosphor-icons/react';
import { useGalleryStore } from '../store/gallery-store';
import { useChatStore } from '../../chat/store/chat-store';
import RoomCard from '../components/RoomCard';
import type { GalleryRoom } from '../types';

function genId(): string {
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function GalleryPage() {
  const navigate = useNavigate();
  const rooms = useGalleryStore((s) => s.rooms);
  const loadRooms = useGalleryStore((s) => s.loadRooms);
  const addRoom = useGalleryStore((s) => s.addRoom);
  const deleteRoom = useGalleryStore((s) => s.deleteRoom);
  const updateRoom = useGalleryStore((s) => s.updateRoom);
  const agents = useChatStore((s) => s.agents);

  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [demolishMode, setDemolishMode] = useState(false);
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set());
  const [showDemolishConfirm, setShowDemolishConfirm] = useState(false);
  const [showBindModal, setShowBindModal] = useState(false);
  const [bindTargetRoomId, setBindTargetRoomId] = useState<string | null>(null);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // ── 新建房间 ──
  const handleCreateRoom = () => {
    const name = newRoomName.trim() || '新房间';
    const room: GalleryRoom = {
      id: genId(),
      name,
      agentId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    addRoom(room);
    setNewRoomName('');
    setShowNewRoom(false);
  };

  // ── 拆毁模式 ──
  const toggleRoomSelection = (id: string) => {
    setSelectedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDemolishConfirm = async () => {
    for (const id of selectedRooms) {
      await deleteRoom(id);
    }
    setSelectedRooms(new Set());
    setDemolishMode(false);
    setShowDemolishConfirm(false);
  };

  // ── 绑定智能体 ──
  const handleRoomClick = useCallback((room: GalleryRoom) => {
    if (demolishMode) {
      toggleRoomSelection(room.id);
      return;
    }
    if (!room.agentId) {
      setBindTargetRoomId(room.id);
      setShowBindModal(true);
      return;
    }
    // 已绑定 → 进入房间
    useGalleryStore.getState().setCurrentRoomId(room.id);
    navigate(`/memory-gallery/room/${room.id}`, { replace: true });
  }, [demolishMode, navigate]);

  const handleBindAgent = (agentId: string) => {
    if (!bindTargetRoomId) return;
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    updateRoom(bindTargetRoomId, { agentId: agent.id, name: agent.name, updatedAt: Date.now() });
    setShowBindModal(false);
    setBindTargetRoomId(null);
  };

  return (
    <div className="gallery-page" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 顶栏 */}
      <div
        className="gallery-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid var(--border, #e5e7eb)',
          flexShrink: 0,
        }}
      >
        <button onClick={() => navigate(-1)} style={btnStyle}>
          <CaretLeft size={20} />
        </button>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 16 }}>记忆游廊</span>
        {!demolishMode && (
          <button onClick={() => setShowNewRoom(true)} style={btnStyle} title="新建房间">
            <Plus size={20} />
          </button>
        )}
        {!demolishMode ? (
          <button onClick={() => setDemolishMode(true)} style={btnStyle} title="拆毁房间">
            <Trash size={20} />
          </button>
        ) : (
          <button onClick={() => { setDemolishMode(false); setSelectedRooms(new Set()); }} style={btnStyle} title="取消">
            <X size={20} />
          </button>
        )}
      </div>

      {/* 房间网格 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {rooms.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              paddingTop: 80,
              color: 'var(--app-text-secondary, #999)',
              fontSize: 14,
            }}
          >
            还没有房间，点击右上角 + 新建
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
              gap: 16,
              justifyItems: 'center',
            }}
          >
            {rooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                agentAvatar={
                  room.agentId ? agents.find((a) => a.id === room.agentId)?.avatar : undefined
                }
                selected={selectedRooms.has(room.id)}
                demolishMode={demolishMode}
                onClick={() => handleRoomClick(room)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── 新建房间弹窗 ── */}
      {showNewRoom && (
        <div className="modal-overlay" onClick={() => setShowNewRoom(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}
            style={{ padding: 20, maxWidth: 320, borderRadius: 12 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>新建房间</h3>
            <input
              autoFocus
              placeholder="房间名称（可选，留空为「新房间」）"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--border, #d1d5db)', fontSize: 14,
                boxSizing: 'border-box', marginBottom: 12,
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="theme-btn theme-btn--cancel" onClick={() => setShowNewRoom(false)}>取消</button>
              <button className="theme-btn" onClick={handleCreateRoom}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 绑定智能体弹窗 ── */}
      {showBindModal && (
        <div className="modal-overlay" onClick={() => setShowBindModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}
            style={{ padding: 20, maxWidth: 360, borderRadius: 12, maxHeight: '60vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>邀请智能体入住</h3>
            {agents.length === 0 ? (
              <p style={{ color: '#999', fontSize: 14 }}>还没有智能体，先去聊天 APP 创建吧</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {agents.map((agent) => {
                  const alreadyBound = rooms.some((r) => r.agentId === agent.id && r.id !== bindTargetRoomId);
                  return (
                    <div
                      key={agent.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 8,
                        background: 'var(--app-surface, #f3f4f6)',
                        opacity: alreadyBound ? 0.5 : 1,
                      }}
                    >
                      <div
                        style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: 'var(--app-primary-light, #e0e7ff)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 600,
                        }}
                      >
                        {agent.name?.charAt(0) || '?'}
                      </div>
                      <span style={{ flex: 1, fontSize: 14 }}>{agent.name}</span>
                      {alreadyBound ? (
                        <span style={{ fontSize: 11, color: '#999' }}>已入住</span>
                      ) : (
                        <button
                          className="theme-btn"
                          style={{ padding: '4px 12px', fontSize: 12 }}
                          onClick={() => handleBindAgent(agent.id)}
                        >
                          绑定
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button className="theme-btn theme-btn--cancel" onClick={() => setShowBindModal(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 拆毁确认弹窗 ── */}
      {showDemolishConfirm && (
        <div className="modal-overlay" onClick={() => setShowDemolishConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}
            style={{ padding: 20, maxWidth: 360, borderRadius: 12 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#ef4444' }}>确认拆毁</h3>
            <p style={{ fontSize: 14, marginBottom: 16 }}>
              是否要拆毁
              <strong>
                {Array.from(selectedRooms)
                  .map((id) => rooms.find((r) => r.id === id)?.name)
                  .filter(Boolean)
                  .join('、')}
              </strong>
              的记忆游廊？此操作不可撤销。
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="theme-btn theme-btn--cancel" onClick={() => setShowDemolishConfirm(false)}>取消</button>
              <button className="theme-btn" style={{ background: '#ef4444', color: '#fff' }} onClick={handleDemolishConfirm}>
                确认拆毁
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 拆毁模式下底部悬浮按钮 */}
      {demolishMode && selectedRooms.size > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '12px 16px',
            background: 'var(--app-bg, #fff)',
            borderTop: '1px solid var(--border, #e5e7eb)',
            display: 'flex',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <button
            className="theme-btn"
            style={{
              background: '#ef4444',
              color: '#fff',
              padding: '10px 32px',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={() => setShowDemolishConfirm(true)}
          >
            拆毁已选房间（{selectedRooms.size}）
          </button>
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 6,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--app-text, #333)',
};
