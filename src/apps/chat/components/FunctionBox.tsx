import { useRef, useState, useCallback, type ReactNode } from 'react';
import {
  GearSix, PaintBrush, Plugs,
  Globe, Brain, Bell, FileText, X,
} from '@phosphor-icons/react';
import { useSettingsStore } from '../../../store/settings-store';

interface FunctionItem {
  id: string;
  label: string;
  icon: ReactNode;
}

const PAGES: FunctionItem[][] = [
  // 第一页
  [
    { id: 'settings', label: '设置', icon: <GearSix size={28} weight="duotone" /> },
    { id: 'beautify', label: '美化', icon: <PaintBrush size={28} weight="duotone" /> },
    { id: 'mcp', label: 'MCP 配置', icon: <Plugs size={28} weight="duotone" /> },
    { id: 'websearch', label: '网络搜索', icon: <Globe size={28} weight="duotone" /> },
  ],
  // 第二页
  [
    { id: 'memory', label: '记忆', icon: <Brain size={28} weight="duotone" /> },
    { id: 'active', label: '主动消息', icon: <Bell size={28} weight="duotone" /> },
    { id: 'context', label: '上下文拼装', icon: <FileText size={28} weight="duotone" /> },
  ],
];

interface FunctionBoxProps {
  onClose: () => void;
  onSelect?: (id: string) => void;
}

export default function FunctionBox({ onClose, onSelect }: FunctionBoxProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const mcpServers = useSettingsStore((s) => s.mcpServers);
  const connectedMCPCount = mcpServers.filter((s) => s.enabled && s.status === 'connected').length;
  const mcpStatusColor = connectedMCPCount > 0 ? '#27ae60' : (mcpServers.length > 0 ? '#e74c3c' : '#aaa');

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setPage(idx);
  }, []);

  const handleItemClick = (fn: FunctionItem) => {
    onClose();
    onSelect?.(fn.id);
  };

  return (
    <div className="funcbox-overlay" onClick={onClose}>
      <div className="funcbox" onClick={(e) => e.stopPropagation()}>
        <div className="funcbox__header">
          <span className="funcbox__title">功能</span>
          <button className="funcbox__close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="funcbox__scroll" ref={scrollRef} onScroll={handleScroll}>
          {PAGES.map((pageItems, pi) => (
            <div key={pi} className="funcbox__page">
              {pageItems.map((fn) => (
                <div
                  key={fn.id}
                  className={`funcbox__item${fn.id === 'mcp' ? ' funcbox__item--mcp' : ''}`}
                  onClick={() => handleItemClick(fn)}
                >
                  <div className="funcbox__item-icon">
                    {fn.icon}
                    {fn.id === 'mcp' && (
                      <span className="funcbox__mcp-dot" style={{ backgroundColor: mcpStatusColor }} />
                    )}
                  </div>
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
