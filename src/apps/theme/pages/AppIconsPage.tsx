import { useState, useEffect, useRef } from 'react';
import { CaretLeft, UploadSimple, FloppyDisk, Check } from '@phosphor-icons/react';
import { useAppStore } from '../../../store/app-store';
import { setItem, getItem } from '../../../services/sqlite/index';
import ImageCrop from '../../../components/ImageCrop';
import type { IconPreset } from '../../../types';

const uid = () => `preset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

export default function AppIconsPage() {
  const apps = useAppStore((s) => s.apps);
  const customIcons = useAppStore((s) => s.customIcons);
  const iconPresets = useAppStore((s) => s.iconPresets);
  const setCustomIcon = useAppStore((s) => s.setCustomIcon);
  const setIconPresets = useAppStore((s) => s.setIconPresets);
  const deleteIconPreset = useAppStore((s) => s.deleteIconPreset);

  const [cropTarget, setCropTarget] = useState<{ appId: string; src: string } | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAppIdRef = useRef<string | null>(null);

  // 加载 icon-presets（custom-icons 已在 App.tsx 启动时加载）
  useEffect(() => {
    let loaded = false;

    getItem('icon-presets').then((saved) => {
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as IconPreset[];
          setIconPresets(parsed);
        } catch { /* ignore */ }
      }
      loaded = true;
    });

    const unsub = useAppStore.subscribe((state, prev) => {
      if (!loaded) return;
      if (state.customIcons !== prev.customIcons) {
        setItem('custom-icons', JSON.stringify(state.customIcons));
      }
      if (state.iconPresets !== prev.iconPresets) {
        setItem('icon-presets', JSON.stringify(state.iconPresets));
      }
    });

    return () => unsub();
  }, [setIconPresets]);

  // ---- 操作 ----
  const handleFileSelect = (appId: string) => {
    pendingAppIdRef.current = appId;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingAppIdRef.current) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCropTarget({ appId: pendingAppIdRef.current!, src: ev.target?.result as string });
      pendingAppIdRef.current = null;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCropConfirm = (croppedDataUrl: string) => {
    if (cropTarget) {
      setCustomIcon(cropTarget.appId, croppedDataUrl);
      setCropTarget(null);
    }
  };

  const handleCropCancel = () => setCropTarget(null);

  /** 恢复单个应用到默认图标 */
  const handleRestoreDefault = (appId: string) => {
    setCustomIcon(appId, null);
  };

  /** 全部恢复为默认图标 */
  const handleApplyDefault = () => {
    const store = useAppStore.getState();
    for (const appId of Object.keys(store.customIcons)) {
      store.setCustomIcon(appId, null);
    }
  };

  /** 应用预设到桌面 */
  const handleApplyPreset = (preset: IconPreset) => {
    const store = useAppStore.getState();
    // 清除当前所有自定义图标
    for (const appId of Object.keys(store.customIcons)) {
      store.setCustomIcon(appId, null);
    }
    // 逐个应用预设图标
    for (const [appId, dataUrl] of Object.entries(preset.icons)) {
      store.setCustomIcon(appId, dataUrl);
    }
  };

  /** 保存当前配置为预设 */
  const handleSavePreset = () => {
    setSaveModalOpen(true);
    setPresetName('');
  };

  const handleConfirmSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const store = useAppStore.getState();
    store.addIconPreset({
      id: uid(),
      name,
      icons: { ...store.customIcons },
    });
    setSaveModalOpen(false);
  };

  const handleDeletePreset = (id: string) => {
    deleteIconPreset(id);
  };

  return (
    <div className="theme-page">
      <div className="theme-page__header">
        <button className="back-btn" onClick={() => window.history.back()}>
          <CaretLeft size={18} /> 返回
        </button>
        <h1>APP 图标</h1>
      </div>

      <div className="theme-page__body">
        {/* 预设列表 */}
        <section className="theme-section">
          <h2>图标预设</h2>
          <div className="icon-presets">
            {/* 默认图标 — 内置固定选项 */}
            <button className="icon-preset-card" onClick={handleApplyDefault}>
              <div className="icon-preset-card__preview icon-preset-card__preview--default">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <span className="icon-preset-card__name">默认图标</span>
            </button>

            {/* 用户保存的预设 */}
            {iconPresets.map((preset) => (
              <div key={preset.id} className="icon-preset-card icon-preset-card--saved">
                <button className="icon-preset-card__apply" onClick={() => handleApplyPreset(preset)} title="应用此预设">
                  <Check size={16} />
                  <span>应用</span>
                </button>
                <span className="icon-preset-card__name">{preset.name}</span>
                <button className="icon-preset-card__delete" onClick={() => handleDeletePreset(preset.id)} title="删除预设">×</button>
              </div>
            ))}
          </div>
        </section>

        {/* APP 图标列表 — 实时反映桌面当前配置 */}
        <section className="theme-section">
          <h2>当前图标</h2>
          <p className="theme-section__desc">以下显示桌面正在使用的图标，改动即时生效</p>
          <div className="app-icon-list">
            {apps.filter((app) => app.enabled).map((app) => (
              <div key={app.id} className="app-icon-list__item">
                <div className="app-icon-list__icon">
                  {customIcons[app.id] ? (
                    <img src={customIcons[app.id]} alt={app.name} className="app-icon-list__img" />
                  ) : (
                    app.icon
                  )}
                </div>
                <span className="app-icon-list__name">{app.name}</span>
                <div className="app-icon-list__actions">
                  {customIcons[app.id] ? (
                    <>
                      <button className="theme-btn theme-btn--small" onClick={() => handleFileSelect(app.id)}>
                        <UploadSimple size={14} /> 更换
                      </button>
                      <button className="theme-btn theme-btn--small theme-btn--cancel" onClick={() => handleRestoreDefault(app.id)}>
                        重置
                      </button>
                    </>
                  ) : (
                    <button className="theme-btn theme-btn--small" onClick={() => handleFileSelect(app.id)}>
                      <UploadSimple size={14} /> 更换
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 保存预设 */}
        <div className="app-icon-list__save">
          <button className="theme-btn theme-btn--primary" onClick={handleSavePreset} disabled={Object.keys(customIcons).length === 0}>
            <FloppyDisk size={18} /> 保存当前为预设
          </button>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} hidden />

      {cropTarget && (
        <ImageCrop src={cropTarget.src} shape="rect" aspectRatio={1} outputWidth={96}
          onCrop={handleCropConfirm} onCancel={handleCropCancel} />
      )}

      {saveModalOpen && (
        <div className="image-crop-overlay" onClick={() => setSaveModalOpen(false)}>
          <div className="preset-save-modal" onClick={(e) => e.stopPropagation()}>
            <h3>保存图标预设</h3>
            <input className="preset-save-modal__input" type="text" placeholder="输入预设名称" value={presetName}
              onChange={(e) => setPresetName(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmSavePreset(); if (e.key === 'Escape') setSaveModalOpen(false); }} />
            <div className="image-crop__actions">
              <button className="theme-btn" onClick={() => setSaveModalOpen(false)}>取消</button>
              <button className="theme-btn" onClick={handleConfirmSavePreset} disabled={!presetName.trim()}>确认</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
