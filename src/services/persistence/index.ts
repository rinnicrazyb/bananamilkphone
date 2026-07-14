/**
 * 数据持久化服务 —— 浏览器开发模式使用 localStorage，
 * 生产环境 Android 使用 Capacitor SQLite。
 * 写入防抖：数据变化后等待 500ms 再写入，避免频繁 I/O。
 */

import type { Conversation, Message, Agent } from '../../apps/chat/types';

const STORAGE_KEY = 'bananamilkphone-data';

interface PersistedData {
  version: number;
  agents: Agent[];
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  timestamp: number;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 500;

/** 从 localStorage 加载数据 */
export function loadData(): PersistedData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedData;
  } catch {
    console.warn('[Persistence] Failed to load data');
    return null;
  }
}

/** 带防抖的保存：多次调用合并为一次写入 */
export function saveDataDebounced(
  agents: Agent[],
  conversations: Conversation[],
  messages: Record<string, Message[]>
): void {
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    const data: PersistedData = {
      version: 1,
      agents,
      conversations,
      messages,
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[Persistence] Save failed:', e);
    }

    debounceTimer = null;
  }, DEBOUNCE_MS);
}

/** 立即保存（用于离开页面等场景） */
export function saveDataImmediately(
  agents: Agent[],
  conversations: Conversation[],
  messages: Record<string, Message[]>
): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  const data: PersistedData = {
    version: 1,
    agents,
    conversations,
    messages,
    timestamp: Date.now(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('[Persistence] Immediate save failed:', e);
  }
}

/** 清除所有数据 */
export function clearData(): void {
  localStorage.removeItem(STORAGE_KEY);
}
