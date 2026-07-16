/**
 * 备份/恢复服务 —— Zip 格式，自动扫描 localStorage + IndexedDB
 */
import JSZip from 'jszip';

export interface BackupManifest {
  createdAt: string;
  version: string;
  appVersion: string;
  stores: string[];
  hasIndexedDB: boolean;
  includedKeys: boolean;
}

const APP_VERSION = '0.2.0';

/** 需要排除的 localStorage 键（临时/缓存数据） */
const EXCLUDE_KEYS = [/^vite-env/i];

/** 生成备份 Zip */
export async function createBackup(includeKeys: boolean): Promise<Blob> {
  const zip = new JSZip();
  const stores: string[] = [];

  // 1. 扫描 localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (EXCLUDE_KEYS.some((re) => re.test(key))) continue;

    // 如果不包含 Key，跳过 settings-store（含 API Key）
    if (!includeKeys && key === 'settings-store') continue;

    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        zip.file(`stores/${key}.json`, raw);
        stores.push(key);
      }
    } catch {
      // 跳过无法读取的项
    }
  }

  // 2. 扫描 IndexedDB
  let hasIndexedDB = false;
  try {
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (!db.name) continue;
      hasIndexedDB = true;
      const data = await exportIndexedDB(db.name);
      if (data) {
        zip.file(`indexeddb/${db.name}.json`, JSON.stringify(data, null, 2));
      }
    }
  } catch {
    // IndexedDB.databases() 在某些浏览器中不支持
  }

  // 3. manifest
  const manifest: BackupManifest = {
    createdAt: new Date().toISOString(),
    version: '1.0',
    appVersion: APP_VERSION,
    stores,
    hasIndexedDB,
    includedKeys: includeKeys,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // 4. info
  zip.file('info.txt', [
    `香蕉牛奶机 数据备份`,
    `备份时间: ${manifest.createdAt}`,
    `APP 版本: ${APP_VERSION}`,
    `包含 Key: ${includeKeys ? '是' : '否'}`,
    ``,
    `备份包含 ${stores.length} 个数据存储, ${hasIndexedDB ? '含 IndexedDB 数据' : '无 IndexedDB 数据'}`,
  ].join('\n'));

  return zip.generateAsync({ type: 'blob' });
}

/** 从 Zip 恢复数据 */
export async function restoreFromZip(file: File): Promise<{ stores: string[]; indexedDB: string[] }> {
  const zip = await JSZip.loadAsync(file);

  // 1. 读取 manifest
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('无效的备份文件：缺少 manifest.json');
  const manifestText = await manifestFile.async('text');
  const manifest: BackupManifest = JSON.parse(manifestText);
  if (!manifest.version) throw new Error('无效的备份文件：缺少版本信息');

  // 2. 恢复 stores
  const stores: string[] = [];
  const storesFolder = zip.folder('stores');
  if (storesFolder) {
    const storeFiles = Object.entries(storesFolder.files).filter(
      ([name]) => name.endsWith('.json') && !name.startsWith('stores/')
    );
    for (const [name, file] of storeFiles) {
      if (file.dir) continue;
      const key = name.replace('.json', '');
      const content = await file.async('text');
      localStorage.setItem(key, content);
      stores.push(key);
    }
  }

  // 3. 恢复 IndexedDB
  const indexedDB: string[] = [];
  const dbsFolder = zip.folder('indexeddb');
  if (dbsFolder) {
    // 注意：浏览器中无法直接覆盖 IndexedDB 数据库，
    // 这里将数据解析后通过原有 APP 逻辑写入
    const dbFiles = Object.entries(dbsFolder.files).filter(
      ([name]) => name.endsWith('.json') && !name.startsWith('indexeddb/')
    );
    for (const [name] of dbFiles) {
      const dbName = name.replace('.json', '');
      indexedDB.push(dbName);
    }
    // IndexedDB 恢复需要各 APP 自行实现，此处仅记录
  }

  return { stores, indexedDB };
}

/** 导出单个 IndexedDB 数据库的全部数据 */
async function exportIndexedDB(dbName: string): Promise<Record<string, unknown[]> | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => {
        const db = req.result;
        const stores: Record<string, unknown[]> = {};
        const storeNames = [...db.objectStoreNames];
        if (storeNames.length === 0) {
          db.close();
          resolve(stores);
          return;
        }
        let completed = 0;
        for (const storeName of storeNames) {
          const transaction = db.transaction(storeName, 'readonly');
          const objectStore = transaction.objectStore(storeName);
          const all = objectStore.getAll();
          all.onsuccess = () => {
            stores[storeName] = all.result;
            completed++;
            if (completed === storeNames.length) {
              db.close();
              resolve(stores);
            }
          };
          all.onerror = () => {
            completed++;
            if (completed === storeNames.length) {
              db.close();
              resolve(stores);
            }
          };
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
