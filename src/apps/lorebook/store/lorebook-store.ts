/**
 * 世界书 Store（Zustand + localStorage 持久化）
 *
 * 世界书数据通过 usePersistence 统一持久化（与 chat-store 同一套机制）。
 */
import { create } from 'zustand';
import type { Lorebook, LorebookEntry } from '../types';

interface LorebookState {
  /** 所有世界书列表 */
  lorebooks: Lorebook[];

  // ── CRUD：世界书级别 ──

  /** 替换整个列表（用于从持久化加载） */
  setLorebooks: (lorebooks: Lorebook[]) => void;

  /** 添加一本世界书 */
  addLorebook: (lorebook: Lorebook) => void;

  /** 更新一本世界书（完整替换） */
  updateLorebook: (id: string, data: Partial<Omit<Lorebook, 'id' | 'createdAt' | 'entries'>>) => void;

  /** 删除一本世界书 */
  removeLorebook: (id: string) => void;

  // ── CRUD：条目级别 ──

  /** 添加条目到指定世界书 */
  addEntry: (lorebookId: string, entry: LorebookEntry) => void;

  /** 更新指定世界书中的某条条目 */
  updateEntry: (lorebookId: string, entryId: string, data: Partial<LorebookEntry>) => void;

  /** 删除指定世界书中的某条条目 */
  removeEntry: (lorebookId: string, entryId: string) => void;

  /** 重新排序条目（替换整个 entries 列表） */
  reorderEntries: (lorebookId: string, entries: LorebookEntry[]) => void;
}

export const useLorebookStore = create<LorebookState>((set) => ({
  lorebooks: [],

  setLorebooks: (lorebooks) => set({ lorebooks }),

  addLorebook: (lorebook) =>
    set((state) => ({
      lorebooks: [lorebook, ...state.lorebooks],
    })),

  updateLorebook: (id, data) =>
    set((state) => ({
      lorebooks: state.lorebooks.map((b) =>
        b.id === id ? { ...b, ...data, updatedAt: Date.now() } : b
      ),
    })),

  removeLorebook: (id) =>
    set((state) => ({
      lorebooks: state.lorebooks.filter((b) => b.id !== id),
    })),

  addEntry: (lorebookId, entry) =>
    set((state) => ({
      lorebooks: state.lorebooks.map((b) =>
        b.id === lorebookId
          ? { ...b, entries: [...b.entries, entry], updatedAt: Date.now() }
          : b
      ),
    })),

  updateEntry: (lorebookId, entryId, data) =>
    set((state) => ({
      lorebooks: state.lorebooks.map((b) =>
        b.id === lorebookId
          ? {
              ...b,
              entries: b.entries.map((e) =>
                e.id === entryId ? { ...e, ...data } : e
              ),
              updatedAt: Date.now(),
            }
          : b
      ),
    })),

  removeEntry: (lorebookId, entryId) =>
    set((state) => ({
      lorebooks: state.lorebooks.map((b) =>
        b.id === lorebookId
          ? {
              ...b,
              entries: b.entries.filter((e) => e.id !== entryId),
              updatedAt: Date.now(),
            }
          : b
      ),
    })),

  reorderEntries: (lorebookId, entries) =>
    set((state) => ({
      lorebooks: state.lorebooks.map((b) =>
        b.id === lorebookId
          ? { ...b, entries, updatedAt: Date.now() }
          : b
      ),
    })),
}));
