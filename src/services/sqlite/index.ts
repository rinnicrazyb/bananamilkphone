/**
 * SQLite 服务层 —— 使用 sql.js（纯 JS WebAssembly SQLite）
 *
 * 浏览器和 Android WebView 使用同一套实现：
 * - 数据库在内存中运行（sql.js WASM）
 * - 通过 IndexedDB 持久化（导出/导入 .db 二进制文件）
 * - 写入防抖，避免频繁序列化
 *
 * 备份时可直接导出完整 .db 文件，类似 RikkaHub 的备份策略。
 */

import initSqlJs from 'sql.js';
import type { SqlJsStatic, Database } from 'sql.js';

// ─── 初始化状态 ──────────────────────────────────

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let initPromise: Promise<void> | null = null;
let initDone = false;

// ─── IndexedDB 持久化（保存/加载 .db 文件） ────────

const PERSIST_DB_NAME = 'bananamilkphone-sqlite';
const PERSIST_STORE = 'database';
const PERSIST_KEY = 'db-bytes';

function openPersistDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PERSIST_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(PERSIST_STORE)) {
        d.createObjectStore(PERSIST_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 从 IndexedDB 加载已保存的数据库文件 */
async function loadSavedDB(): Promise<Uint8Array | null> {
  try {
    const persistDB = await openPersistDB();
    return new Promise((resolve, reject) => {
      const tx = persistDB.transaction(PERSIST_STORE, 'readonly');
      const req = tx.objectStore(PERSIST_STORE).get(PERSIST_KEY);
      req.onsuccess = () => {
        const row = req.result;
        if (row?.value) {
          resolve(new Uint8Array(row.value));
        } else {
          resolve(null);
        }
        persistDB.close();
      };
      req.onerror = () => {
        persistDB.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** 将当前数据库保存到 IndexedDB（带防抖） */
function saveDBToIndexedDB(): void {
  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    if (!db) return;
    try {
      const data = db.export(); // Uint8Array
      const persistDB = await openPersistDB();
      const tx = persistDB.transaction(PERSIST_STORE, 'readwrite');
      tx.objectStore(PERSIST_STORE).put({ key: PERSIST_KEY, value: Array.from(data) });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      persistDB.close();
    } catch (err) {
      console.warn('[SQLite] Save to IndexedDB failed:', err);
    }
  }, 500);
}

/** 立即保存（页面关闭前） */
function saveDBImmediately(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!db) return;
  try {
    const data = db.export();
    openPersistDB().then((persistDB) => {
      const tx = persistDB.transaction(PERSIST_STORE, 'readwrite');
      tx.objectStore(PERSIST_STORE).put({ key: PERSIST_KEY, value: Array.from(data) });
      tx.oncomplete = () => persistDB.close();
    });
  } catch {
    // 静默失败
  }
}

// ─── 数据库初始化 ──────────────────────────────────

/** 初始化 sql.js 数据库 */
export async function initDatabase(): Promise<void> {
  if (initDone) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // 加载 sql.js WASM
      SQL = await initSqlJs();

      // 尝试从 IndexedDB 加载已保存的数据库
      const saved = await loadSavedDB();
      if (saved) {
        db = new SQL.Database(saved);
      } else {
        db = new SQL.Database();
        // 首次初始化：建表
        db.run(`
          CREATE TABLE IF NOT EXISTS app_data (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `);
        db.run(`
          CREATE TABLE IF NOT EXISTS media (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `);
        // 新数据库立即持久化
        saveDBToIndexedDB();
      }

      // 确保表存在（兼容旧数据库文件）
      db.run(`CREATE TABLE IF NOT EXISTS app_data (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
      db.run(`CREATE TABLE IF NOT EXISTS media (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`);

      // 页面关闭前保存
      window.addEventListener('beforeunload', saveDBImmediately);

      // 清空旧 localStorage（一次性）
      try {
        localStorage.removeItem('bananamilkphone-data');
        localStorage.removeItem('settings-store');
      } catch { /* ignore */ }

      console.log('[SQLite] sql.js initialized successfully');
      initDone = true;
    } catch (err) {
      console.error('[SQLite] Initialization failed:', err);
      throw err;
    }
  })();

  return initPromise;
}

// ─── 工具 ──────────────────────────────────────────

function ensureDB(): Database {
  if (!db) throw new Error('[SQLite] Database not initialized');
  return db;
}

// ─── app_data 操作 ─────────────────────────────────

/** 读取一条数据 */
export async function getItem(key: string): Promise<string | null> {
  await initDatabase();
  try {
    const result = ensureDB().exec(`SELECT value FROM app_data WHERE key = ?`, [key]);
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] as string;
    }
    return null;
  } catch (err) {
    console.warn(`[SQLite] getItem("${key}") failed:`, err);
    return null;
  }
}

/** 写入一条数据 */
export async function setItem(key: string, value: string): Promise<void> {
  await initDatabase();
  try {
    ensureDB().run(
      `INSERT OR REPLACE INTO app_data (key, value, updated_at) VALUES (?, ?, ?)`,
      [key, value, Date.now()]
    );
    saveDBToIndexedDB();
  } catch (err) {
    console.warn(`[SQLite] setItem("${key}") failed:`, err);
  }
}

/** 删除一条数据 */
export async function removeItem(key: string): Promise<void> {
  await initDatabase();
  try {
    ensureDB().run(`DELETE FROM app_data WHERE key = ?`, [key]);
    saveDBToIndexedDB();
  } catch (err) {
    console.warn(`[SQLite] removeItem("${key}") failed:`, err);
  }
}

/** 获取所有 key */
export async function getAllKeys(): Promise<string[]> {
  await initDatabase();
  try {
    const result = ensureDB().exec(`SELECT key FROM app_data ORDER BY key`);
    if (result.length > 0) {
      return result[0].values.map((row: unknown[]) => row[0] as string);
    }
    return [];
  } catch (err) {
    console.warn('[SQLite] getAllKeys failed:', err);
    return [];
  }
}

/** 清空所有数据 */
export async function clearAll(): Promise<void> {
  await initDatabase();
  try {
    ensureDB().run(`DELETE FROM app_data`);
    ensureDB().run(`DELETE FROM media`);
    saveDBToIndexedDB();
  } catch (err) {
    console.warn('[SQLite] clearAll failed:', err);
  }
}

// ─── media 操作 ────────────────────────────────────

/** 保存媒体文件 */
export async function saveMedia(key: string, dataUrl: string): Promise<void> {
  await initDatabase();
  try {
    ensureDB().run(
      `INSERT OR REPLACE INTO media (key, value, updated_at) VALUES (?, ?, ?)`,
      [key, dataUrl, Date.now()]
    );
    saveDBToIndexedDB();
  } catch (err) {
    console.warn(`[SQLite] saveMedia("${key}") failed:`, err);
  }
}

/** 读取媒体文件 */
export async function getMedia(key: string): Promise<string | null> {
  await initDatabase();
  try {
    const result = ensureDB().exec(`SELECT value FROM media WHERE key = ?`, [key]);
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] as string;
    }
    return null;
  } catch (err) {
    console.warn(`[SQLite] getMedia("${key}") failed:`, err);
    return null;
  }
}

/** 删除媒体文件 */
export async function deleteMedia(key: string): Promise<void> {
  await initDatabase();
  try {
    ensureDB().run(`DELETE FROM media WHERE key = ?`, [key]);
    saveDBToIndexedDB();
  } catch (err) {
    console.warn(`[SQLite] deleteMedia("${key}") failed:`, err);
  }
}

/** 生成唯一媒体 key */
export function generateMediaKey(prefix: string, ext: string = 'png'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

// ─── 数据库导出（用于备份） ─────────────────────────

/** 导出完整数据库为 Uint8Array */
export function exportDatabase(): Uint8Array {
  ensureDB();
  return db!.export();
}

/** 从 Uint8Array 导入数据库（用于恢复） */
export function importDatabase(data: Uint8Array): void {
  if (db) db.close();
  db = new SQL!.Database(data);
  saveDBToIndexedDB();
}

// ─── Zustand persist 适配器 ─────────────────────────

export const sqliteStorageAdapter = {
  getItem(name: string): Promise<string | null> {
    return getItem(name);
  },
  setItem(name: string, value: string): Promise<void> {
    return setItem(name, value);
  },
  removeItem(name: string): Promise<void> {
    return removeItem(name);
  },
};
