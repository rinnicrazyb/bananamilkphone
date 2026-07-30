import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DotsThree } from '@phosphor-icons/react';
import { useGalleryStore } from '../store/gallery-store';
import { useChatStore } from '../../chat/store/chat-store';
import MemoryBrowser from '../components/MemoryBrowser';
import ReviewPage from '../components/ReviewPage';
import TrashPage from '../components/TrashPage';

type Tab = 'review' | 'browser' | 'trash';

const TAB_LABELS: Record<Tab, string> = {
  review: '审批',
  browser: '游廊',
  trash: '回收站',
};

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const rooms = useGalleryStore((s) => s.rooms);
  const agents = useChatStore((s) => s.agents);
  const [tab, setTab] = useState<Tab>('review');

  const room = rooms.find((r) => r.id === roomId);
  const agent = room?.agentId ? agents.find((a) => a.id === room.agentId) : null;

  // 如果 room 没加载，尝试从 DB 重新加载
  useEffect(() => {
    if (!room && roomId) {
      useGalleryStore.getState().loadRooms();
    }
  }, [room, roomId]);

  if (!room) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
        房间不存在
      </div>
    );
  }

  // ── 未绑定 → 显示入住引导 ──
  if (!room.agentId) {
    return <BindPrompt room={room} />;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 顶栏 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '44px 1fr 44px',
          alignItems: 'center',
          padding: '0 12px',
          minHeight: 52,
          flexShrink: 0,
          borderBottom: '1px solid var(--app-border)',
        }}
      >
        <button onClick={() => navigate('/memory-gallery', { replace: true })}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            width: 36, height: 36, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--app-text)',
          }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
        </button>
        <span style={{
          textAlign: 'center',
          fontSize: 18,
          fontWeight: 500,
          color: 'var(--app-text)',
        }}>
          {agent?.name || room.name}
        </span>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <RoomMenuButton roomId={room.id} />
        </div>
      </div>

      {/* 分段选择器 */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          margin: '8px 16px 10px',
          padding: 3,
          borderRadius: 10,
          background: 'var(--app-secondary)',
          flexShrink: 0,
        }}
      >
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: active ? 600 : 450,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                color: active ? 'var(--app-text)' : 'var(--app-text-secondary)',
                background: active ? 'var(--app-bg-card)' : 'transparent',
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all .18s',
                fontFamily: 'inherit',
              }}
            >
              {TAB_LABELS[t]}
            </button>
          );
        })}
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'browser' && <MemoryBrowser roomId={room.id} />}
        {tab === 'review' && <ReviewPage roomId={room.id} />}
        {tab === 'trash' && <TrashPage roomId={room.id} />}
      </div>
    </div>
  );
}

/** 未绑定的房间：入住引导 */
function BindPrompt({ room }: { room: { id: string; name: string } }) {
  const [showBind, setShowBind] = useState(false);
  const agents = useChatStore((s) => s.agents);
  const rooms = useGalleryStore((s) => s.rooms);
  const updateRoom = useGalleryStore((s) => s.updateRoom);
  const navigate = useNavigate();

  const handleBind = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    updateRoom(room.id, { agentId: agent.id, name: agent.name, updatedAt: Date.now() });
    setShowBind(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr', alignItems: 'center', padding: '0 12px', minHeight: 52, flexShrink: 0, borderBottom: '1px solid var(--app-border)' }}>
        <button onClick={() => navigate('/memory-gallery', { replace: true })}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            width: 36, height: 36, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--app-text)',
          }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
        <div className="gallery-pixel-house" style={{ fontSize: 64, opacity: 0.4 }}>
          🏠
        </div>
        <p style={{ fontSize: 15, color: 'var(--app-text-secondary, #999)', textAlign: 'center' }}>
          还没有人入住，邀请ta来入住吧
        </p>
        <button className="theme-btn" onClick={() => setShowBind(true)}>
          邀请智能体
        </button>
      </div>

      {showBind && (
        <div className="modal-overlay" onClick={() => setShowBind(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}
            style={{ padding: 20, maxWidth: 360, borderRadius: 12, maxHeight: '60vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>邀请智能体入住</h3>
            {agents.length === 0 ? (
              <p style={{ color: '#999', fontSize: 14 }}>还没有智能体</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {agents.map((agent) => {
                  const alreadyBound = rooms.some((r) => r.agentId === agent.id && r.id !== room.id);
                  return (
                    <div key={agent.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 8,
                      background: 'var(--app-surface, #f3f4f6)',
                      opacity: alreadyBound ? 0.5 : 1,
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: 'var(--app-primary-light, #e0e7ff)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 600,
                      }}>
                        {agent.name?.charAt(0) || '?'}
                      </div>
                      <span style={{ flex: 1, fontSize: 14 }}>{agent.name}</span>
                      {alreadyBound ? (
                        <span style={{ fontSize: 11, color: '#999' }}>已入住</span>
                      ) : (
                        <button className="theme-btn" style={{ padding: '4px 12px', fontSize: 12 }}
                          onClick={() => handleBind(agent.id)}>绑定</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button className="theme-btn theme-btn--cancel" onClick={() => setShowBind(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 右上角功能菜单 */
function RoomMenuButton({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(false);
  const updateRoom = useGalleryStore((s) => s.updateRoom);
  const rooms = useGalleryStore((s) => s.rooms);
  const agents = useChatStore((s) => s.agents);
  const room = rooms.find((r) => r.id === roomId);
  const [showBind, setShowBind] = useState(false);

  // 换绑弹窗逻辑复用 BindPrompt 中的弹窗，简化放在这里内联

  return (
    <>
      <button onClick={() => setOpen(!open)} style={btnStyle} title="更多">
        <DotsThree size={20} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: '100%', zIndex: 100,
            background: 'var(--app-bg, #fff)',
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            padding: 4, minWidth: 140,
          }}>
            <MenuBtn label="更换入住人" onClick={() => { setOpen(false); setShowBind(true); }} />
            <MenuBtn label="创建新空间" onClick={() => { setOpen(false); /* TODO: domain 创建 */ }} />
          </div>
        </>
      )}

      {/* 换绑弹窗 */}
      {showBind && (
        <div className="modal-overlay" onClick={() => setShowBind(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}
            style={{ padding: 20, maxWidth: 360, borderRadius: 12, maxHeight: '60vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>更换入住人</h3>
            <p style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>更换后记忆保留，换绑到新的智能体</p>
            {agents.map((agent) => (
              <div key={agent.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 8,
                background: 'var(--app-surface, #f3f4f6)', marginBottom: 6,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--app-primary-light, #e0e7ff)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 600,
                }}>
                  {agent.name?.charAt(0) || '?'}
                </div>
                <span style={{ flex: 1, fontSize: 14 }}>{agent.name}</span>
                {room?.agentId === agent.id ? (
                  <span style={{ fontSize: 11, color: '#10b981' }}>当前</span>
                ) : (
                  <button className="theme-btn" style={{ padding: '4px 12px', fontSize: 12 }}
                    onClick={() => { updateRoom(roomId, { agentId: agent.id, name: agent.name }); setShowBind(false); }}>
                    换绑
                  </button>
                )}
              </div>
            ))}
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button className="theme-btn theme-btn--cancel" onClick={() => setShowBind(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MenuBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', padding: '8px 12px', fontSize: 13,
        background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6,
        textAlign: 'left', color: 'var(--app-text, #333)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--app-surface-hover, #f3f4f6)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
    >
      {label}
    </button>
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
