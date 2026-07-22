import { create } from 'zustand';
import type { AppMeta, IconPreset, ThemeConfig } from '../types';

interface AppState {
  /** 已注册的 APP 列表 */
  apps: AppMeta[];
  /** 桌面网格槽位（app id 或 null 空位），按 4×6 分页 */
  desktopGrid: (string | null)[];
  /** 主题配置 */
  theme: ThemeConfig;
  /** 自定义 APP 图标（appId → dataUrl） */
  customIcons: Record<string, string>;
  /** 图标预设列表 */
  iconPresets: IconPreset[];
  /** 是否已从 SQLite 加载主题（防止 save effect 首次挂载覆盖） */
  _themeLoaded: boolean;

  // Actions
  registerApp: (app: AppMeta) => void;
  setDesktopGrid: (grid: (string | null)[]) => void;
  updateTheme: (config: Partial<ThemeConfig>) => void;
  setCustomIcon: (appId: string, dataUrl: string | null) => void;
  setIconPresets: (presets: IconPreset[]) => void;
  addIconPreset: (preset: IconPreset) => void;
  deleteIconPreset: (id: string) => void;
  _setThemeLoaded: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  apps: [],
  desktopGrid: [],
  theme: {
    mode: 'system',
    preset: 'banana-milk',
    wallpaperOpacity: 1,
    wallpaperBlur: 0,
  },
  customIcons: {},
  iconPresets: [],
  _themeLoaded: false,

  registerApp: (app) =>
    set((state) => {
      if (state.apps.some((a) => a.id === app.id)) return state;
      const next = [...state.desktopGrid];
      // 找第一个空位填空，否则追加
      const emptyIdx = next.indexOf(null);
      if (emptyIdx !== -1) {
        next[emptyIdx] = app.id;
      } else {
        next.push(app.id);
      }
      return { apps: [...state.apps, app], desktopGrid: next };
    }),

  setDesktopGrid: (grid) => set({ desktopGrid: grid }),

  updateTheme: (config) =>
    set((state) => ({
      theme: { ...state.theme, ...config },
    })),

  setCustomIcon: (appId, dataUrl) =>
    set((state) => {
      const next = { ...state.customIcons };
      if (dataUrl === null) {
        delete next[appId];
      } else {
        next[appId] = dataUrl;
      }
      return { customIcons: next };
    }),

  setIconPresets: (presets) => set({ iconPresets: presets }),

  addIconPreset: (preset) =>
    set((state) => ({
      iconPresets: [...state.iconPresets, preset],
    })),

  deleteIconPreset: (id) =>
    set((state) => ({
      iconPresets: state.iconPresets.filter((p) => p.id !== id),
    })),

  _setThemeLoaded: () => set({ _themeLoaded: true }),
}));
