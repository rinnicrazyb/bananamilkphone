/**
 * MessageContextMenu — 消息右键/长按操作菜单
 *
 * 桌面端：onContextMenu → 禁用默认右键 → 显示菜单
 * 移动端：长按 400ms → 显示菜单
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export interface MenuAction {
  label: string;
  icon: string;       // Phosphor Icons 名称
  onClick: () => void;
  danger?: boolean;
}

interface Props {
  actions: MenuAction[];
  children: React.ReactNode;
  /** 是否启用右键菜单 */
  enabled?: boolean;
}

export default function MessageContextMenu({ actions, children, enabled = true }: Props) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  const close = useCallback(() => {
    setShow(false);
    isLongPress.current = false;
  }, []);

  // 点击外部关闭
  useEffect(() => {
    if (!show) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [show, close]);

  // 桌面端右键
  const handleContextMenu = (e: React.MouseEvent) => {
    if (!enabled) return;
    e.preventDefault();
    setPos({ x: e.clientX, y: e.clientY });
    setShow(true);
  };

  // 移动端长按
  const handleTouchStart = () => {
    if (!enabled) return;
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      // 使用屏幕中心作为菜单位置
      setPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      setShow(true);
    }, 400);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleTouchMove = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  return (
    <div
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      style={{ touchAction: 'manipulation' }}
    >
      {children}

      {show && (
        <>
          {/* 遮罩层 */}
          <div
            onClick={close}
            style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'transparent' }}
          />
          {/* 菜单 */}
          <div
            ref={menuRef}
            className="msg-context-menu"
            style={{
              position: 'fixed',
              left: Math.min(pos.x, window.innerWidth - 180),
              top: Math.min(pos.y, window.innerHeight - actions.length * 44 - 16),
              zIndex: 101,
            }}
          >
            {actions.map((action, i) => (
              <button
                key={i}
                className={`msg-context-menu__item ${action.danger ? 'msg-context-menu__item--danger' : ''}`}
                onClick={() => { action.onClick(); close(); }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
