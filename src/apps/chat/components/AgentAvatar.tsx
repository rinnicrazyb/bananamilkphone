import type { ReactNode } from 'react';

/** 智能体头像渲染：emoji / data URL / 图片 URL 自适应 */
export default function AgentAvatar({
  avatar,
  className,
  children,
  frameSrc,
}: {
  avatar: string;
  className?: string;
  children?: ReactNode;
  frameSrc?: string;
}) {
  const isImage =
    avatar.startsWith('data:') ||
    avatar.startsWith('http://') ||
    avatar.startsWith('https://');

  if (isImage) {
    return (
      <div className={className} style={{ overflow: 'hidden', position: 'relative' }}>
        <img
          src={avatar}
          alt="avatar"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {frameSrc && (
          <img src={frameSrc} alt="头像框" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
        )}
        {children}
      </div>
    );
  }

  return (
    <div className={className} style={{ position: 'relative' }}>
      <span>{avatar}</span>
      {frameSrc && (
        <img src={frameSrc} alt="头像框" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      )}
      {children}
    </div>
  );
}
