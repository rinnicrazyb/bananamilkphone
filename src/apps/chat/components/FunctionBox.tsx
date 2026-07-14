interface FunctionItem {
  id: string;
  label: string;
  icon: string;
}

const FUNCTIONS: FunctionItem[] = [
  { id: 'voice', label: '语音通话', icon: '🎤' },
  { id: 'settings', label: '设置', icon: '⚙️' },
  { id: 'beautify', label: '美化', icon: '🎨' },
  { id: 'mcp', label: 'MCP 配置', icon: '🔌' },
  { id: 'websearch', label: '网络搜索', icon: '🌐' },
  { id: 'memory', label: '记忆', icon: '🧠' },
  { id: 'active', label: '主动消息', icon: '📨' },
  { id: 'thinking', label: '思考强度', icon: '💭' },
  { id: 'context', label: '上下文拼装', icon: '📋' },
];

interface FunctionBoxProps {
  onClose: () => void;
}

export default function FunctionBox({ onClose }: FunctionBoxProps) {
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
          {FUNCTIONS.map((fn) => (
            <div key={fn.id} className="funcbox__item">
              <div className="funcbox__item-icon">{fn.icon}</div>
              <span className="funcbox__item-label">{fn.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
