/**
 * 主题引擎 —— 只控制 CSS 变量，不干涉 APP 内部逻辑
 */

import type { ThemeConfig } from '../../types';

type ThemeChangeHandler = (config: ThemeConfig) => void;

class ThemeEngine {
  private currentConfig: ThemeConfig = {
    mode: 'system',
    preset: 'banana-milk',
    wallpaperOpacity: 1,
    wallpaperBlur: 0,
  };
  private listeners: ThemeChangeHandler[] = [];

  /** 获取当前主题配置 */
  getConfig(): ThemeConfig {
    return { ...this.currentConfig };
  }

  /** 应用主题配置 */
  apply(config: Partial<ThemeConfig>): void {
    this.currentConfig = { ...this.currentConfig, ...config };
    this.syncCSSVariables();
    this.notify();
  }

  /** 监听主题变化 */
  onChange(handler: ThemeChangeHandler): () => void {
    this.listeners.push(handler);
    return () => {
      this.listeners = this.listeners.filter((h) => h !== handler);
    };
  }

  /** 检测系统深色模式 */
  isSystemDark(): boolean {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /** 判断当前有效模式 */
  getEffectiveMode(): 'light' | 'dark' {
    if (this.currentConfig.mode === 'system') {
      return this.isSystemDark() ? 'dark' : 'light';
    }
    return this.currentConfig.mode;
  }

  /** 应用主题预设（CSS 变量） */
  private syncCSSVariables(): void {
    const root = document.documentElement;
    const mode = this.getEffectiveMode();

    root.setAttribute('data-theme', mode);

    if (this.currentConfig.wallpaper) {
      root.style.setProperty('--app-wallpaper', `url(${this.currentConfig.wallpaper})`);
      root.style.setProperty(
        '--app-wallpaper-opacity',
        String(this.currentConfig.wallpaperOpacity)
      );
      root.style.setProperty(
        '--app-wallpaper-blur',
        `${this.currentConfig.wallpaperBlur}px`
      );
    } else {
      root.style.setProperty('--app-wallpaper', 'none');
      root.style.setProperty('--app-wallpaper-opacity', '1');
      root.style.setProperty('--app-wallpaper-blur', '0px');
    }

    if (this.currentConfig.fontFamily) {
      root.style.setProperty('--app-font-family', this.currentConfig.fontFamily);
    } else {
      root.style.removeProperty('--app-font-family');
    }
  }

  private notify(): void {
    for (const handler of this.listeners) {
      handler(this.getConfig());
    }
  }
}

export const themeEngine = new ThemeEngine();
