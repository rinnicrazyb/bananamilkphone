import { useState } from 'react';

interface BeautifyPageProps {
  onBack: () => void;
}

export default function BeautifyPage({ onBack }: BeautifyPageProps) {
  const [bgOpacity, setBgOpacity] = useState(1);
  const [bgBlur, setBgBlur] = useState(0);
  const [showAvatars, setShowAvatars] = useState(true);
  const [useBubbles, setUseBubbles] = useState(true);
  const [segmentBubbles, setSegmentBubbles] = useState(false);
  const [bubbleFollowAvatar, setBubbleFollowAvatar] = useState(false);
  const [showTime, setShowTime] = useState(true);
  const [showTokens, setShowTokens] = useState(false);

  return (
    <div className="func-fullpage">
      <div className="func-fullpage__header">
        <button className="back-btn" onClick={onBack}>← 返回</button>
        <h1>聊天美化</h1>
      </div>
      <div className="func-fullpage__body">
        <section className="settings-section">
          <h2>聊天背景</h2>
          <label className="settings-field">
            <span>背景透明度 ({Math.round(bgOpacity * 100)}%)</span>
            <input type="range" min="0" max="1" step="0.05" value={bgOpacity}
              onChange={(e) => setBgOpacity(parseFloat(e.target.value))} />
          </label>
          <label className="settings-field">
            <span>背景模糊度 ({bgBlur}px)</span>
            <input type="range" min="0" max="20" step="1" value={bgBlur}
              onChange={(e) => setBgBlur(parseInt(e.target.value))} />
          </label>
          <p className="settings-field__hint">上传聊天背景请在主题APP中操作</p>
        </section>

        <section className="settings-section">
          <h2>显示选项</h2>
          <label className="settings-field settings-field--row">
            <span>显示头像</span>
            <input type="checkbox" checked={showAvatars}
              onChange={(e) => setShowAvatars(e.target.checked)} />
          </label>
          <label className="settings-field settings-field--row">
            <span>使用气泡样式</span>
            <input type="checkbox" checked={useBubbles}
              onChange={(e) => setUseBubbles(e.target.checked)} />
          </label>
          <label className="settings-field settings-field--row">
            <span>气泡按段分割</span>
            <input type="checkbox" checked={segmentBubbles}
              onChange={(e) => setSegmentBubbles(e.target.checked)} />
          </label>
          <label className="settings-field settings-field--row">
            <span>气泡跟随头像</span>
            <input type="checkbox" checked={bubbleFollowAvatar}
              onChange={(e) => setBubbleFollowAvatar(e.target.checked)} />
          </label>
          <label className="settings-field settings-field--row">
            <span>显示消息时间</span>
            <input type="checkbox" checked={showTime}
              onChange={(e) => setShowTime(e.target.checked)} />
          </label>
          <label className="settings-field settings-field--row">
            <span>显示 Token 数</span>
            <input type="checkbox" checked={showTokens}
              onChange={(e) => setShowTokens(e.target.checked)} />
          </label>
        </section>

        <section className="settings-section">
          <h2>自定义样式</h2>
          <p className="settings-field__hint">自定义气泡样式（上传图片）和头像框将在后续版本支持</p>
        </section>
      </div>
    </div>
  );
}
