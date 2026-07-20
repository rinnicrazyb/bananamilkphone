/**
 * 数据持久化服务 —— 使用 SQLite（通过 @capacitor-community/sqlite）
 *
 * 浏览器开发模式：sql.js (WebAssembly)
 * Android 生产环境：原生 SQLite
 *
 * 写入防抖：数据变化后等待 500ms 再写入，避免频繁 I/O。
 * 媒体文件（图片等）作为 JSON 字符串内嵌在 app_data 中，
 * 后续可迁移到独立的 media 表或 IndexedDB。
 */

import type { Conversation, Message, Agent, Memory } from '../../apps/chat/types';
import type { Lorebook } from '../../apps/lorebook/types';
import * as sqlite from '../sqlite/index';

const STORAGE_KEY = 'bananamilkphone-data';

interface PersistedData {
  version: number;
  agents: Agent[];
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  memories: Record<string, Memory[]>;
  lorebooks: Lorebook[];
  desktopOrder?: string[];
  settings?: Record<string, unknown>;
  timestamp: number;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 500;

/** 从 SQLite 加载数据 */
export async function loadData(): Promise<PersistedData | null> {
  try {
    // 确保数据库已初始化
    await sqlite.initDatabase();

    const raw = await sqlite.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedData;
  } catch (err) {
    console.warn('[Persistence] Failed to load data:', err);
    return null;
  }
}

/** 保存数据到 SQLite（实际写入函数） */
async function writeData(
  agents: Agent[],
  conversations: Conversation[],
  messages: Record<string, Message[]>,
  memories: Record<string, Memory[]>,
  lorebooks: Lorebook[] = [],
  desktopOrder?: string[]
): Promise<void> {
  const data: PersistedData = {
    version: 4,
    agents,
    conversations,
    messages,
    memories,
    lorebooks,
    desktopOrder,
    timestamp: Date.now(),
  };

  await sqlite.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** 带防抖的保存：多次调用合并为一次写入 */
export function saveDataDebounced(
  agents: Agent[],
  conversations: Conversation[],
  messages: Record<string, Message[]>,
  memories: Record<string, Memory[]>,
  lorebooks: Lorebook[] = [],
  desktopOrder?: string[]
): void {
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(async () => {
    try {
      await writeData(agents, conversations, messages, memories, lorebooks, desktopOrder);
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
  messages: Record<string, Message[]>,
  memories: Record<string, Memory[]>,
  lorebooks: Lorebook[] = [],
  desktopOrder?: string[]
): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  // 立即执行，不等待（fire-and-forget）
  writeData(agents, conversations, messages, memories, lorebooks, desktopOrder).catch((e) => {
    console.warn('[Persistence] Immediate save failed:', e);
  });
}

/** 清除所有数据 */
export async function clearData(): Promise<void> {
  await sqlite.clearAll();
}
