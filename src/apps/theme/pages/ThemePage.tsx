import { useRef, useState } from 'react';
import { useAppStore } from '../../../store/app-store';
import { themeEngine } from '../../../services/theme-engine/index';

export default function ThemePage() {
  const theme = useAppStore((s) => s.theme);
  const updateTheme = useAppStore((s) => s.updateTheme);
  const [wallpaperPreview, setWallpaperPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleModeChange = (mode: 'light' | 'dark' | 'system') => {
    updateTheme({ mode });
    themeEngine.apply({ mode });
  };

  const handleWallpaperUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setWallpaperPreview(dataUrl);
      updateTheme({ wallpaper: dataUrl });
      themeEngine.apply({ wallpaper: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    updateTheme({ wallpaperOpacity: val });
    themeEngine.apply({ wallpaperOpacity: val });
  };

  const handleBlurChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    updateTheme({ wallpaperBlur: val });
    themeEngine.apply({ wallpaperBlur: val });
  };

  const handleFontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith('.ttf')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const fontFace = new FontFace('custom-font', `url(${dataUrl})`);
      fontFace.load().then(() => {
        document.fonts.add(fontFace);
        updateTheme({ fontFamily: 'custom-font' });
        themeEngine.apply({ fontFamily: 'custom-font' });
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="theme-page">
      <div className="theme-page__header">
        <button className="back-btn" onClick={() => window.history.back()}>
          ← 返回
        </button>
        <h1>主题</h1>
      </div>

      <div className="theme-page__body">
        {/* 颜色模式 */}
        <section className="theme-section">
          <h2>颜色模式</h2>
          <div className="theme-mode-selector">
            {(['light', 'dark', 'system'] as const).map((mode) => (
              <button
                key={mode}
                className={`theme-mode-btn ${theme.mode === mode ? 'active' : ''}`}
                onClick={() => handleModeChange(mode)}
              >
                {mode === 'light' ? '☀️ 浅色' : mode === 'dark' ? '🌙 深色' : '🖥️ 跟随系统'}
              </button>
            ))}
          </div>
        </section>

        {/* 壁纸 */}
        <section className="theme-section">
          <h2>桌面壁纸</h2>
          <div className="wallpaper-preview">
            {wallpaperPreview && (
              <img
                src={wallpaperPreview}
                alt="壁纸预览"
                className="wallpaper-preview__img"
              />
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleWallpaperUpload}
              hidden
            />
            <button
              className="theme-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              📁 选择图片
            </button>
          </div>

          {wallpaperPreview && (
            <div className="wallpaper-sliders">
              <label>
                透明度：{Math.round(theme.wallpaperOpacity * 100)}%
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={theme.wallpaperOpacity}
                  onChange={handleOpacityChange}
                />
              </label>
              <label>
                模糊度：{theme.wallpaperBlur}px
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="1"
                  value={theme.wallpaperBlur}
                  onChange={handleBlurChange}
                />
              </label>
            </div>
          )}
        </section>

        {/* 字体 */}
        <section className="theme-section">
          <h2>自定义字体</h2>
          <p className="theme-section__desc">仅支持 TTF 格式</p>
          <input
            type="file"
            accept=".ttf"
            onChange={handleFontUpload}
            hidden
            id="font-upload"
          />
          <label htmlFor="font-upload" className="theme-btn">
            📄 上传字体
          </label>
          {theme.fontFamily && (
            <p className="theme-section__current">当前字体：{theme.fontFamily}</p>
          )}
        </section>
      </div>

      {/* 底部确认 */}
      <div className="theme-page__footer">
        <button className="theme-btn theme-btn--cancel" onClick={() => window.history.back()}>
          取消
        </button>
      </div>
    </div>
  );
}
