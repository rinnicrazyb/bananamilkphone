import type { ReactNode } from 'react';

/** 已注册 APP 的描述 */
export interface AppMeta {
  id: string;
  name: string;
  icon: ReactNode;
  route: string;
  enabled: boolean;
}

/** APP 图标预设 */
export interface IconPreset {
  id: string;
  name: string;
  /** appId → dataUrl 映射 */
  icons: Record<string, string>;
}

/** 主题配置 */
export interface ThemeConfig {
  mode: 'light' | 'dark' | 'system';
  preset: string;
  wallpaper?: string;
  wallpaperOpacity: number;
  wallpaperBlur: number;
  fontFamily?: string;
  /** TTF 字体文件的 dataURL，用于刷新后重新加载 FontFace */
  fontData?: string;
}

/** 事件总线事件 */
export interface AppEvent<T = unknown> {
  type: string;
  payload: T;
  timestamp: number;
  id: string;
}
