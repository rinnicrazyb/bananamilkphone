import { useState } from 'react';

import { X } from '@phosphor-icons/react';

interface ChatSettingsPanelProps {
  onClose: () => void;
}

export default function ChatSettingsPanel({ onClose }: ChatSettingsPanelProps) {
  const [autoFoldThinking, setAutoFoldThinking] = useState(true);

  return (
    <div className="funcbox-overlay" onClick={onClose}>
      <div className="beautify-panel" onClick={(e) => e.stopPropagation()}>
        <div className="beautify-panel__header">
          <h2>聊天设置</h2>
          <button className="funcbox__close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="beautify-panel__body">
          <label className="settings-field settings-field--row">
            <span>自动折叠思考链</span>
            <input
              type="checkbox"
              checked={autoFoldThinking}
              onChange={(e) => setAutoFoldThinking(e.target.checked)}
            />
          </label>
          <p className="settings-field__hint">
            开启后思考链默认收起，可手动展开
          </p>

          <div className="settings-field">
            <span>Tool Call 工具列表</span>
            <p className="settings-field__hint">（后续版本支持）</p>
          </div>
        </div>
      </div>
    </div>
  );
}
