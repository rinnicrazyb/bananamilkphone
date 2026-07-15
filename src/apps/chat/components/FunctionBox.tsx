import { useRef, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GearSix, PaintBrush, Plugs,
  Globe, Brain, Bell, Gauge, FileText,
} from '@phosphor-icons/react';

interface FunctionItem {
  id: string;
  label: string;
  icon: ReactNode;
  route?: string;
}

const PAGES: FunctionItem[][] = [
  // 第一页
  [
    { id: 'settings', label: '设置', icon: <GearSix size={28} weight="duotone" />, route: '/chat/settings' },
    { id: 'beautify', label: '美化', icon: <PaintBrush size={28} weight="duotone" />, route: '/chat/beautify' },
    { id: 'mcp', label: 'MCP 配置', icon: <Plugs size={28} weight="duotone" />, route: '/chat/mcp' },
    { id: 'websearch', label: '网络搜索', icon: <Globe size={28} weight="duotone" />, route: '/chat/websearch' },
  ],
  // 第二页
  [
    { id: 'memory', label: '记忆', icon: <Brain size={28} weight="duotone" />, route: '/chat/memory' },
    { id: 'active', label: '主动消息', icon: <Bell size={28} weight="duotone" />, route: '/chat/active' },
    { id: 'thinking', label: '思考强度', icon: <Gauge size={28} weight="duotone" />, route: '/chat/thinking' },
    { id: 'context', label: '上下文拼装', icon: <FileText size={28} weight="duotone" />, route: '/chat/context' },
  ],
];

interface FunctionBoxProps {
  onClose: () => void;
}

export default function FunctionBox({ onClose }: FunctionBoxProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const navigate = useNavigate();

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setPage(idx);
  }, []);

  const handleItemClick = (fn: FunctionItem) => {
    onClose();
    if (fn.route) navigate(fn.route);
  };

  return (
    <div className="funcbox-overlay" onClick={onClose}>
      <div className="funcbox" onClick={(e) => e.stopPropagation()}>
        <div className="funcbox__header">
          <span className="funcbox__title">功能</span>
          <button className="funcbox__close" onClick={onClose}>✕</button>
        </div>
        <div className="funcbox__scroll" ref={scrollRef} onScroll={handleScroll}>
          {PAGES.map((pageItems, pi) => (
            <div key={pi} className="funcbox__page">
              {pageItems.map((fn) => (
                <div
                  key={fn.id}
                  className="funcbox__item"
                  onClick={() => handleItemClick(fn)}
                >
                  <div className="funcbox__item-icon">{fn.icon}</div>
                  <span className="funcbox__item-label">{fn.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        {PAGES.length > 1 && (
          <div className="funcbox__dots">
            {PAGES.map((_, i) => (
              <span key={i} className={`funcbox__dot ${i === page ? 'funcbox__dot--active' : ''}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
