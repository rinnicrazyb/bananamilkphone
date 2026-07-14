import { create } from 'zustand';
import type { AppMeta, ThemeConfig } from '../types';

interface AppState {
  /** 已注册的 APP 列表 */
  apps: AppMeta[];
  /** 桌面 APP 排序（app id 列表） */
  desktopOrder: string[];
  /** 主题配置 */
  theme: ThemeConfig;

  // Actions
  registerApp: (app: AppMeta) => void;
  setDesktopOrder: (order: string[]) => void;
  updateTheme: (config: Partial<ThemeConfig>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  apps: [],
  desktopOrder: [],
  theme: {
    mode: 'system',
    preset: 'banana-milk',
    wallpaperOpacity: 1,
    wallpaperBlur: 0,
  },

  registerApp: (app) =>
    set((state) => ({
      apps: state.apps.some((a) => a.id === app.id)
        ? state.apps
        : [...state.apps, app],
    })),

  setDesktopOrder: (order) => set({ desktopOrder: order }),

  updateTheme: (config) =>
    set((state) => ({
      theme: { ...state.theme, ...config },
    })),
}));
