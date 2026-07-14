/**
 * IndexedDB 封装 —— 仅用于可丢失的临时数据（UI状态、缓存）
 * 核心数据（聊天记录、记忆等）使用 SQLite
 */

const DB_NAME = 'bananamilkphone-cache';
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const indexedDBService = {
  async getDB(): Promise<IDBDatabase> {
    if (!_db) _db = await openDB();
    return _db;
  },

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache', 'readonly');
      const req = tx.objectStore('cache').get(key);
      req.onsuccess = () => resolve(req.result?.value as T);
      req.onerror = () => reject(req.error);
    });
  },

  async set(key: string, value: unknown): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache', 'readwrite');
      const req = tx.objectStore('cache').put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async delete(key: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache', 'readwrite');
      const req = tx.objectStore('cache').delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
};
