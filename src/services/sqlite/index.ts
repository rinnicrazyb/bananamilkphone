/**
 * SQLite 服务层 —— 使用 @capacitor-community/sqlite
 *
 * 浏览器开发模式：sql.js (WebAssembly) 作为 SQLite 引擎，数据持久化到 IndexedDB
 * Android 生产环境：原生 SQLite
 *
 * 提供简单的 key-value 接口，与原有 localStorage 用法兼容。
 */

import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { CapacitorSQLitePlugin } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

const DB_NAME = 'bananamilkphone';

interface DbRow {
  value: string;
}

let sqliteConnection: SQLiteConnection | null = null;
let db: Awaited<ReturnType<SQLiteConnection['createConnection']>> | null = null;

let initPromise: Promise<void> | null = null;
let initDone = false;

/** 获取平台信息 */
function getPlatform(): 'web' | 'android' | 'ios' {
  return Capacitor.getPlatform() as 'web' | 'android' | 'ios';
}

/**
 * 初始化数据库
 * - 创建连接
 * - 建表（app_data 用于文本数据，media 用于媒体文件）
 * - 清空旧的 localStorage 数据（一次性迁移）
 */
export async function initDatabase(): Promise<void> {
  if (initDone) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const platform = getPlatform();

      // @capacitor-community/sqlite 初始化
      sqliteConnection = new SQLiteConnection(CapacitorSQLite as CapacitorSQLitePlugin);

      // Web 平台需要额外初始化 sql.js 存储
      if (platform === 'web') {
        await sqliteConnection.initWebStore();
      }

      // 创建数据库连接
      db = await sqliteConnection.createConnection(DB_NAME, false, 'no-encryption', 1, false);
      await db.open();

      // 建表：app_data — 文本/结构化数据（JSON 序列化）
      await db.execute(`
        CREATE TABLE IF NOT EXISTS app_data (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);

      // 建表：media — 媒体文件（base64 dataURL）
      await db.execute(`
        CREATE TABLE IF NOT EXISTS media (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);

      // Web 平台：保存数据库到持久化存储（IndexedDB 后端）
      if (platform === 'web') {
        await sqliteConnection.saveToStore(DB_NAME);
      }

      // 清空旧 localStorage 数据（一次性操作）
      try {
        localStorage.removeItem('bananamilkphone-data');
        localStorage.removeItem('settings-store');
      } catch {
        // localStorage 可能不可用（如某些 WebView），忽略
      }

      console.log('[SQLite] Database initialized successfully');
      initDone = true;
    } catch (err) {
      console.error('[SQLite] Initialization failed:', err);
      throw err;
    }
  })();

  return initPromise;
}

/** 等待数据库初始化完成 */
async function ensureDb() {
  if (!initDone) {
    await initDatabase();
  }
  if (!db) throw new Error('[SQLite] Database not initialized');
  return db;
}

// ─── app_data 操作（文本/结构化数据） ──────────────────

/** 读取一条数据（返回 JSON 字符串或 null） */
export async function getItem(key: string): Promise<string | null> {
  try {
    const database = await ensureDb();
    const result = await database.query(`SELECT value FROM app_data WHERE key = ?`, [key]);
    const rows = result.values as unknown[] as DbRow[];
    return rows.length > 0 ? rows[0].value : null;
  } catch (err) {
    console.warn(`[SQLite] getItem("${key}") failed:`, err);
    return null;
  }
}

/** 写入一条数据 */
export async function setItem(key: string, value: string): Promise<void> {
  try {
    const database = await ensureDb();
    await database.run(
      `INSERT OR REPLACE INTO app_data (key, value, updated_at) VALUES (?, ?, ?)`,
      [key, value, Date.now()]
    );

    // Web 平台：每次写入后保存到持久化存储
    if (getPlatform() === 'web') {
      await sqliteConnection!.saveToStore(DB_NAME);
    }
  } catch (err) {
    console.warn(`[SQLite] setItem("${key}") failed:`, err);
  }
}

/** 删除一条数据 */
export async function removeItem(key: string): Promise<void> {
  try {
    const database = await ensureDb();
    await database.run(`DELETE FROM app_data WHERE key = ?`, [key]);

    if (getPlatform() === 'web') {
      await sqliteConnection!.saveToStore(DB_NAME);
    }
  } catch (err) {
    console.warn(`[SQLite] removeItem("${key}") failed:`, err);
  }
}

/** 获取所有 key（用于备份） */
export async function getAllKeys(): Promise<string[]> {
  try {
    const database = await ensureDb();
    const result = await database.query(`SELECT key FROM app_data ORDER BY key`, []);
    const rows = result.values as unknown as Array<{ key: string }>;
    return rows.map((r) => r.key);
  } catch (err) {
    console.warn('[SQLite] getAllKeys failed:', err);
    return [];
  }
}

/** 清空所有数据 */
export async function clearAll(): Promise<void> {
  try {
    const database = await ensureDb();
    await database.execute(`DELETE FROM app_data`);
    await database.execute(`DELETE FROM media`);

    if (getPlatform() === 'web') {
      await sqliteConnection!.saveToStore(DB_NAME);
    }
  } catch (err) {
    console.warn('[SQLite] clearAll failed:', err);
  }
}

// ─── media 操作（图片/媒体文件） ────────────────────

/** 保存媒体文件（base64 dataURL） */
export async function saveMedia(key: string, dataUrl: string): Promise<void> {
  try {
    const database = await ensureDb();
    await database.run(
      `INSERT OR REPLACE INTO media (key, value, updated_at) VALUES (?, ?, ?)`,
      [key, dataUrl, Date.now()]
    );

    if (getPlatform() === 'web') {
      await sqliteConnection!.saveToStore(DB_NAME);
    }
  } catch (err) {
    console.warn(`[SQLite] saveMedia("${key}") failed:`, err);
  }
}

/** 读取媒体文件 */
export async function getMedia(key: string): Promise<string | null> {
  try {
    const database = await ensureDb();
    const result = await database.query(`SELECT value FROM media WHERE key = ?`, [key]);
    const rows = result.values as unknown[] as DbRow[];
    return rows.length > 0 ? rows[0].value : null;
  } catch (err) {
    console.warn(`[SQLite] getMedia("${key}") failed:`, err);
    return null;
  }
}

/** 删除媒体文件 */
export async function deleteMedia(key: string): Promise<void> {
  try {
    const database = await ensureDb();
    await database.run(`DELETE FROM media WHERE key = ?`, [key]);

    if (getPlatform() === 'web') {
      await sqliteConnection!.saveToStore(DB_NAME);
    }
  } catch (err) {
    console.warn(`[SQLite] deleteMedia("${key}") failed:`, err);
  }
}

/** 生成唯一的媒体 key */
export function generateMediaKey(prefix: string, ext: string = 'png'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

// ─── Zustand persist 中间件适配器 ─────────────────

/**
 * 用于 Zustand `persist` 中间件的 storage 适配器
 * 替换默认的 localStorage，使用 SQLite
 *
 * 用法：
 *   persist(
 *     (set) => ({ ... }),
 *     {
 *       name: 'settings-store',
 *       storage: sqliteStorageAdapter,  // 替代默认 localStorage
 *     }
 *   )
 */
export const sqliteStorageAdapter = {
  async getItem(name: string): Promise<string | null> {
    return getItem(name);
  },
  async setItem(name: string, value: string): Promise<void> {
    return setItem(name, value);
  },
  async removeItem(name: string): Promise<void> {
    return removeItem(name);
  },
};
