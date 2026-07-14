import ApiSettings from '../components/ApiSettings';

export default function SettingsPage() {
  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <button className="back-btn" onClick={() => window.history.back()}>
          ← 返回
        </button>
        <h1>设置</h1>
      </div>

      <div className="settings-page__body">
        <ApiSettings />

        <div className="settings-section">
          <h2>关于</h2>
          <div className="settings-about">
            <p>香蕉牛奶机 v0.1.0</p>
            <p className="settings-section__desc">
              AI 伴侣小手机 · 所有数据仅保存在本地
            </p>
          </div>
        </div>
      </div>

      <div className="settings-page__footer">
        <button className="theme-btn" onClick={() => window.history.back()}>
          确认
        </button>
        <button
          className="theme-btn theme-btn--cancel"
          onClick={() => window.history.back()}
        >
          取消
        </button>
      </div>
    </div>
  );
}
