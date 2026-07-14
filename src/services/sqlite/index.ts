/**
 * SQLite 服务层 —— 使用 @capacitor-community/sqlite
 * Phase 0 为骨架占位，后续填充完整 CRUD
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null;

export const sqliteService = {
  /** 初始化数据库连接 */
  async initialize(): Promise<void> {
    // Phase 0: stub — 等待 @capacitor-community/sqlite API 稳定后接入
    console.log('[SQLite] service stub ready');
  },

  /** 获取数据库实例 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDB(): any {
    return db;
  },

  /** 执行查询 */
  async query<T = unknown>(_sql: string, _params?: unknown[]): Promise<T[]> {
    return [];
  },

  /** 执行写入 */
  async execute(_sql: string, _params?: unknown[]): Promise<void> {
    // stub
  },
};
