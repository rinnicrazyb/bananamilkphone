import { House } from '@phosphor-icons/react';
import type { GalleryRoom } from '../types';

interface RoomCardProps {
  room: GalleryRoom;
  agentAvatar?: string;        // 智能体头像（data URL / http URL / emoji）
  selected?: boolean;
  demolishMode?: boolean;
  onClick: () => void;
}

/** 渲染智能体头像：图片URL显示图片，否则显示文字 */
function AvatarImage({ avatar }: { avatar: string }) {
  const isImage =
    avatar.startsWith('data:') ||
    avatar.startsWith('http://') ||
    avatar.startsWith('https://');

  if (isImage) {
    return <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  return <span style={{ fontSize: 13, lineHeight: 1 }}>{avatar}</span>;
}

export default function RoomCard({ room, agentAvatar, selected, demolishMode, onClick }: RoomCardProps) {
  const hasAgent = !!room.agentId;

  return (
    <div
      className="gallery-room-card"
      data-selected={selected || false}
      onClick={onClick}
      style={{ position: 'relative', cursor: 'pointer' }}
    >
      {/* 拆毁模式下的勾选框 */}
      {demolishMode && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            zIndex: 2,
            width: 20,
            height: 20,
            borderRadius: 4,
            border: '2px solid #ef4444',
            background: selected ? '#ef4444' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 12,
            fontWeight: 'bold',
          }}
        >
          {selected ? '✓' : ''}
        </div>
      )}

      {/* 房屋图标容器 */}
      <div
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 80,
          height: 80,
        }}
      >
        {/* 像素风格房屋 */}
        <div className="gallery-pixel-house">
          <House size={64} weight="fill" />
        </div>

        {/* 已绑定：左上角智能体头像 */}
        {hasAgent && agentAvatar && (
          <div
            style={{
              position: 'absolute',
              top: -4,
              left: -4,
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '2px solid var(--app-bg, #fff)',
              overflow: 'hidden',
              background: 'var(--app-surface, #e0e0e0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AvatarImage avatar={agentAvatar} />
          </div>
        )}

        {/* 未绑定：右上角小加号暗示 */}
        {!hasAgent && (
          <div
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'var(--app-primary, #6366f1)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 'bold',
              lineHeight: 1,
            }}
          >
            +
          </div>
        )}
      </div>

      {/* 房间名称 / 入住状态 */}
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          color: hasAgent ? 'var(--app-text, #333)' : 'var(--app-text-secondary, #999)',
          textAlign: 'center',
          maxWidth: 80,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {hasAgent ? `${room.name}已入住` : '空房间'}
      </div>
    </div>
  );
}
