import { useState } from 'react';
import { DownloadSimple, CaretLeft, CheckCircle, XCircle } from '@phosphor-icons/react';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative } from '../../../utils/platform';
import { createBackup } from '../../../services/backup/index';

interface Props {
  onBack: () => void;
}

/** Blob → base64（FileReader 读取，自动分块） */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export default function BackupPage({ onBack }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [includeKeys, setIncludeKeys] = useState(false);

  const handleBackup = async () => {
    setBusy(true);
    setResult(null);
    try {
      const blob = await createBackup(includeKeys);
      const filename = `bananamilkphone-backup-${new Date().toISOString().slice(0, 10)}.zip`;

      if (isNative()) {
        // 原生环境：写入临时文件 → 弹出系统分享/另存为
        const base64 = await blobToBase64(blob);
        await Filesystem.writeFile({
          path: filename,
          data: base64,
          directory: Directory.Cache,
        });

        const uri = await Filesystem.getUri({
          path: filename,
          directory: Directory.Cache,
        });

        await Share.share({
          title: '香蕉牛奶机备份',
          text: '数据备份文件',
          url: uri.uri,
          dialogTitle: '保存备份到…',
        });

        setResult({ ok: true, msg: '备份文件已导出' });
      } else {
        // 浏览器环境：直接下载
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setResult({ ok: true, msg: '备份文件已下载' });
      }
    } catch (err) {
      setResult({ ok: false, msg: `备份失败: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <button className="back-btn" onClick={onBack}><CaretLeft size={18} /> 返回</button>
        <h1>本地备份</h1>
      </div>

      <div className="settings-page__body">
        <div className="settings-section">
          <p className="settings-section__desc">
            将所有数据打包为 Zip 文件下载到本地。包括：
          </p>
          <ul className="settings-bullet-list">
            <li>所有 APP 的配置数据（SQLite）</li>
            <li>媒体文件缓存数据（IndexedDB）</li>
          </ul>

          <label className="settings-checkbox" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeKeys}
              onChange={(e) => setIncludeKeys(e.target.checked)}
            />
            <span>包含 API Key 等敏感信息（注意妥善保管备份文件）</span>
          </label>

          <div className="settings-backup-cta">
            <DownloadSimple size={48} className="settings-backup-cta__icon" />
            <button
              className="theme-btn"
              onClick={handleBackup}
              disabled={busy}
            >
              {busy ? '正在备份…' : '开始备份'}
            </button>
          </div>

          {result && (
            <div className={`settings-backup-result ${result.ok ? 'settings-backup-result--ok' : 'settings-backup-result--err'}`}>
              {result.ok ? <CheckCircle size={18} weight="fill" /> : <XCircle size={18} weight="fill" />} {result.msg}
            </div>
          )}
        </div>
      </div>

      <div className="settings-page__footer">
        <button className="theme-btn" onClick={onBack}>确认</button>
        <button className="theme-btn theme-btn--cancel" onClick={onBack}>取消</button>
      </div>
    </div>
  );
}
