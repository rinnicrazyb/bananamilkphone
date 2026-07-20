import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretLeft, Sun, Moon, Monitor, FolderOpen, FileText } from '@phosphor-icons/react';
import { useAppStore } from '../../../store/app-store';
import { themeEngine } from '../../../services/theme-engine/index';
import ImageCrop from '../../../components/ImageCrop';

export default function ThemePage() {
  const navigate = useNavigate();
  const theme = useAppStore((s) => s.theme);
  const updateTheme = useAppStore((s) => s.updateTheme);
  // 从持久化恢复已有壁纸预览
  const [wallpaperPreview, setWallpaperPreview] = useState<string | null>(theme.wallpaper ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const handleModeChange = (mode: 'light' | 'dark' | 'system') => {
    updateTheme({ mode });
    themeEngine.apply({ mode });
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCropSrc(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
    // 重置 input 以便重复选择同一文件
    e.target.value = '';
  };

  const handleCropConfirm = (croppedDataUrl: string) => {
    setWallpaperPreview(croppedDataUrl);
    updateTheme({ wallpaper: croppedDataUrl });
    themeEngine.apply({ wallpaper: croppedDataUrl });
    setCropSrc(null);
  };

  const handleCropCancel = () => {
    setCropSrc(null);
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
        updateTheme({ fontFamily: 'custom-font', fontData: dataUrl });
        themeEngine.apply({ fontFamily: 'custom-font' });
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="theme-page">
      <div className="theme-page__header">
        <button className="back-btn" onClick={() => window.history.back()}>
          <CaretLeft size={18} /> 返回
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
                {mode === 'light' ? <><Sun size={20} /> 浅色</> : mode === 'dark' ? <><Moon size={20} /> 深色</> : <><Monitor size={20} /> 跟随系统</>}
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
                style={{
                  opacity: theme.wallpaperOpacity,
                  filter: `blur(${theme.wallpaperBlur}px)`,
                }}
              />
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelected}
              hidden
            />
            <div className="wallpaper-preview__btns">
              <button
                className="theme-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <FolderOpen size={18} /> 选择图片
              </button>
              {wallpaperPreview && (
                <button
                  className="theme-btn theme-btn--cancel"
                  onClick={() => {
                    setWallpaperPreview(null);
                    updateTheme({ wallpaper: undefined });
                    themeEngine.apply({ wallpaper: undefined });
                  }}
                >
                  移除壁纸
                </button>
              )}
            </div>
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

        {/* APP 图标 */}
        <section className="theme-section">
          <h2>自定义 APP 图标</h2>
          <p className="theme-section__desc">为每个应用设置自定义图标</p>
          <button
            className="theme-btn"
            onClick={() => navigate('/theme/app-icons')}
          >
            管理图标
          </button>
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
            <FileText size={18} /> 上传字体
          </label>
          {theme.fontFamily && (
            <>
              <p className="theme-section__current">当前字体：{theme.fontFamily}</p>
              <button
                className="theme-btn theme-btn--cancel"
                style={{ marginTop: 8 }}
                onClick={() => {
                  updateTheme({ fontFamily: undefined, fontData: undefined });
                  themeEngine.apply({ fontFamily: undefined });
                }}
              >
                恢复默认
              </button>
            </>
          )}
        </section>
      </div>

      {/* 底部确认 */}
      <div className="theme-page__footer">
        <button className="theme-btn theme-btn--cancel" onClick={() => window.history.back()}>
          取消
        </button>
      </div>

      {/* 裁剪弹窗 */}
      {cropSrc && (
        <ImageCrop
          src={cropSrc}
          shape="rect"
          aspectRatio={9 / 16}
          outputWidth={360}
          onCrop={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
