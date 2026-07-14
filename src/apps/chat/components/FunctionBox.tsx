import { useNavigate } from 'react-router-dom';
import {
  PhoneCall,
  GearSix,
  PaintBrush,
  Plugs,
  Globe,
  Brain,
  Bell,
  Gauge,
  FileText,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';

interface FunctionItem {
  id: string;
  label: string;
  icon: ReactNode;
  action?: () => void;
}

interface FunctionBoxProps {
  onClose: () => void;
}

export default function FunctionBox({ onClose }: FunctionBoxProps) {
  const navigate = useNavigate();

  const items: FunctionItem[] = [
    {
      id: 'voice',
      label: '语音通话',
      icon: <PhoneCall size={28} weight="duotone" />,
    },
    {
      id: 'settings',
      label: '设置',
      icon: <GearSix size={28} weight="duotone" />,
      action: () => {
        onClose();
        navigate('/settings');
      },
    },
    {
      id: 'beautify',
      label: '美化',
      icon: <PaintBrush size={28} weight="duotone" />,
      action: () => {
        onClose();
        navigate('/theme');
      },
    },
    {
      id: 'mcp',
      label: 'MCP 配置',
      icon: <Plugs size={28} weight="duotone" />,
    },
    {
      id: 'websearch',
      label: '网络搜索',
      icon: <Globe size={28} weight="duotone" />,
    },
    {
      id: 'memory',
      label: '记忆',
      icon: <Brain size={28} weight="duotone" />,
    },
    {
      id: 'active',
      label: '主动消息',
      icon: <Bell size={28} weight="duotone" />,
    },
    {
      id: 'thinking',
      label: '思考强度',
      icon: <Gauge size={28} weight="duotone" />,
    },
    {
      id: 'context',
      label: '上下文拼装',
      icon: <FileText size={28} weight="duotone" />,
    },
  ];

  return (
    <div className="funcbox-overlay" onClick={onClose}>
      <div className="funcbox" onClick={(e) => e.stopPropagation()}>
        <div className="funcbox__header">
          <span className="funcbox__title">功能</span>
          <button className="funcbox__close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="funcbox__grid">
          {items.map((fn) => (
            <div
              key={fn.id}
              className="funcbox__item"
              onClick={() => fn.action?.()}
            >
              <div className="funcbox__item-icon">
                {fn.icon}
              </div>
              <span className="funcbox__item-label">{fn.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
