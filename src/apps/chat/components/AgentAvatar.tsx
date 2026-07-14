import type { ReactNode } from 'react';

/** 智能体头像渲染：emoji / data URL / 图片 URL 自适应 */
export default function AgentAvatar({
  avatar,
  className,
  children,
}: {
  avatar: string;
  className?: string;
  children?: ReactNode;
}) {
  const isImage =
    avatar.startsWith('data:') ||
    avatar.startsWith('http://') ||
    avatar.startsWith('https://');

  if (isImage) {
    return (
      <div className={className} style={{ overflow: 'hidden' }}>
        <img
          src={avatar}
          alt="avatar"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {children}
      </div>
    );
  }

  return (
    <div className={className}>
      <span>{avatar}</span>
      {children}
    </div>
  );
}
