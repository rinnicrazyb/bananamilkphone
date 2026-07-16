import { useState } from 'react';

import { X } from '@phosphor-icons/react';

interface BeautifyPanelProps {
  onClose: () => void;
}

export default function BeautifyPanel({ onClose }: BeautifyPanelProps) {
  const [bgOpacity, setBgOpacity] = useState(1);
  const [bgBlur, setBgBlur] = useState(0);
  const [showAvatars, setShowAvatars] = useState(true);
  const [useBubbles, setUseBubbles] = useState(true);
  const [showTime, setShowTime] = useState(true);

  return (
    <div className="funcbox-overlay" onClick={onClose}>
      <div className="beautify-panel" onClick={(e) => e.stopPropagation()}>
        <div className="beautify-panel__header">
          <h2>聊天美化</h2>
          <button className="funcbox__close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="beautify-panel__body">
          <label className="settings-field">
            <span>聊天背景透明度 ({Math.round(bgOpacity * 100)}%)</span>
            <input
              type="range" min="0" max="1" step="0.05"
              value={bgOpacity}
              onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
            />
          </label>
          <label className="settings-field">
            <span>背景模糊度 ({bgBlur}px)</span>
            <input
              type="range" min="0" max="20" step="1"
              value={bgBlur}
              onChange={(e) => setBgBlur(parseInt(e.target.value))}
            />
          </label>
          <label className="settings-field settings-field--row">
            <span>显示头像</span>
            <input
              type="checkbox" checked={showAvatars}
              onChange={(e) => setShowAvatars(e.target.checked)}
            />
          </label>
          <label className="settings-field settings-field--row">
            <span>使用气泡样式</span>
            <input
              type="checkbox" checked={useBubbles}
              onChange={(e) => setUseBubbles(e.target.checked)}
            />
          </label>
          <label className="settings-field settings-field--row">
            <span>显示消息时间</span>
            <input
              type="checkbox" checked={showTime}
              onChange={(e) => setShowTime(e.target.checked)}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
