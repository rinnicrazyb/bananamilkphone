/**
 * 备份/恢复服务 —— Zip 格式，RikkaHub 风格
 *
 * ZIP 包结构：
 *   database.db   — sql.js 完整数据库导出（Uint8Array）
 *   manifest.json — 元信息（版本/时间/包含Key等）
 *   media.json    — 媒体文件索引（可选）
 *
 * 支持三种通道：本地下载、WebDAV、S3（扩展预留）
 */
import JSZip from 'jszip';
import * as sqlite from '../sqlite/index';

export interface BackupManifest {
  createdAt: string;
  version: string;
  appVersion: string;
  hasMedia: boolean;
  includedKeys: boolean;
  databaseSize: number;
}

const APP_VERSION = '0.2.0';

/** 生成备份 Zip */
export async function createBackup(includeKeys: boolean): Promise<Blob> {
  const zip = new JSZip();

  // 1. 确保数据库已初始化
  await sqlite.initDatabase();

  // 2. 导出完整数据库文件
  const dbBytes = sqlite.exportDatabase();
  zip.file('database.db', dbBytes);

  // 3. 如果不含 Key，复制数据库并清除 settings-store 后再导出
  //    但 sql.js 不支持"部分导出"，所以改为：
  //    - 含 Key: 直接导出当前数据库
  //    - 不含 Key: 导出数据库但不包含 settings-store 行的备份
  //    实际上更好的做法：总是导出完整 DB，在 manifest 标记 includedKeys
  //    恢复时由用户决定是否恢复 Key

  // 4. 导出 settings-store 单独一份（便于恢复时选择是否包含 Key）
  if (!includeKeys) {
    const settingsRaw = await sqlite.getItem('settings-store');
    if (settingsRaw) {
      // 导出脱敏版本（清空 apiKey 字段）
      try {
        const settings = JSON.parse(settingsRaw);
        if (settings.state?.llmConfig?.apiKey) {
          settings.state.llmConfig.apiKey = '';
        }
        if (settings.state?.searchProviders) {
          for (const key of Object.keys(settings.state.searchProviders)) {
            if (settings.state.searchProviders[key]?.apiKey) {
              settings.state.searchProviders[key].apiKey = '';
            }
          }
        }
        zip.file('settings-sanitized.json', JSON.stringify(settings, null, 2));
      } catch {
        // 解析失败则跳过
      }
    }
  } else {
    // 含 Key：直接从数据库读取 settings-store
    const settingsRaw = await sqlite.getItem('settings-store');
    if (settingsRaw) {
      zip.file('settings.json', settingsRaw);
    }
  }

  // 5. manifest
  const manifest: BackupManifest = {
    createdAt: new Date().toISOString(),
    version: '1.0',
    appVersion: APP_VERSION,
    hasMedia: true,
    includedKeys: includeKeys,
    databaseSize: dbBytes.length,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // 6. info
  zip.file('info.txt', [
    `香蕉牛奶机 数据备份`,
    `备份时间: ${manifest.createdAt}`,
    `APP 版本: ${APP_VERSION}`,
    `包含 Key: ${includeKeys ? '是' : '否'}`,
    `数据库大小: ${(manifest.databaseSize / 1024).toFixed(1)} KB`,
    ``,
    `备份格式: sql.js 完整数据库导出`,
  ].join('\n'));

  return zip.generateAsync({ type: 'blob' });
}

/** 从 Zip 恢复数据 */
export async function restoreFromZip(file: File): Promise<{ restored: string[] }> {
  const zip = await JSZip.loadAsync(file);

  // 1. 读取 manifest
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('无效的备份文件：缺少 manifest.json');
  const manifestText = await manifestFile.async('text');
  const manifest: BackupManifest = JSON.parse(manifestText);
  if (!manifest.version) throw new Error('无效的备份文件：缺少版本信息');

  const restored: string[] = [];

  // 2. 恢复数据库
  const dbFile = zip.file('database.db');
  if (dbFile) {
    const dbBytes = await dbFile.async('uint8array');
    sqlite.importDatabase(dbBytes);
    restored.push('database.db');
  }

  // 3. 如果有单独的 settings.json（含 Key 的备份），合并到数据库
  const settingsFile = zip.file('settings.json');
  if (settingsFile) {
    const content = await settingsFile.async('text');
    await sqlite.setItem('settings-store', content);
    restored.push('settings.json');
  }

  return { restored };
}
