/**
 * 数据持久化服务 —— 使用 SQLite（通过 @capacitor-community/sqlite）
 *
 * 浏览器开发模式：sql.js (WebAssembly)
 * Android 生产环境：原生 SQLite
 *
 * 主数据结构：messageNodes（MessageNode[]），不再保存 flat messages
 */
import type { Conversation, Agent, Memory } from '../../apps/chat/types';
import type { MessageNode } from '../../apps/chat/types';
import type { Lorebook } from '../../apps/lorebook/types';
import * as sqlite from '../sqlite/index';

const STORAGE_KEY = 'bananamilkphone-data';

interface PersistedData {
  version: number;
  agents: Agent[];
  conversations: Conversation[];
  messages?: Record<string, unknown[]>; // 旧版兼容，不再使用
  messageNodes?: Record<string, MessageNode[]>;
  memories: Record<string, Memory[]>;
  lorebooks: Lorebook[];
  desktopGrid?: (string | null)[];
  settings?: Record<string, unknown>;
  timestamp: number;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 500;

/** 从 SQLite 加载数据 */
export async function loadData(): Promise<PersistedData | null> {
  try {
    await sqlite.initDatabase();
    const raw = await sqlite.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedData;
  } catch (err) {
    console.warn('[Persistence] Failed to load data:', err);
    return null;
  }
}

async function writeData(
  agents: Agent[],
  conversations: Conversation[],
  memories: Record<string, Memory[]>,
  lorebooks: Lorebook[] = [],
  desktopGrid?: (string | null)[],
  messageNodes?: Record<string, MessageNode[]>
): Promise<void> {
  const data: PersistedData = {
    version: 5,
    agents,
    conversations,
    messageNodes,
    memories,
    lorebooks,
    desktopGrid,
    timestamp: Date.now(),
  };
  await sqlite.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** 带防抖的保存 */
export function saveDataDebounced(
  agents: Agent[],
  conversations: Conversation[],
  memories: Record<string, Memory[]>,
  lorebooks: Lorebook[] = [],
  desktopGrid?: (string | null)[],
  messageNodes?: Record<string, MessageNode[]>
): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    try {
      await writeData(agents, conversations, memories, lorebooks, desktopGrid, messageNodes);
    } catch (e) {
      console.warn('[Persistence] Save failed:', e);
    }
    debounceTimer = null;
  }, DEBOUNCE_MS);
}

/** 立即保存 */
export function saveDataImmediately(
  agents: Agent[],
  conversations: Conversation[],
  memories: Record<string, Memory[]>,
  lorebooks: Lorebook[] = [],
  desktopGrid?: (string | null)[],
  messageNodes?: Record<string, MessageNode[]>
): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  writeData(agents, conversations, memories, lorebooks, desktopGrid, messageNodes).catch((e) => {
    console.warn('[Persistence] Immediate save failed:', e);
  });
}

/** 清除所有数据 */
export async function clearData(): Promise<void> {
  await sqlite.clearAll();
}
