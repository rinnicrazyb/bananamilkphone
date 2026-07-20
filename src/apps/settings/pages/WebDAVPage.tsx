import { useState } from 'react';
import { CaretLeft, CloudArrowUp, CheckCircle, XCircle } from '@phosphor-icons/react';
import { useSettingsStore } from '../../../store/settings-store';
import { testConnection, listBackups, uploadBackup, downloadBackup, deleteBackup, type WebDAVFileInfo } from '../../../services/webdav/index';
import { createBackup, restoreFromZip } from '../../../services/backup/index';

interface Props {
  onBack: () => void;
}

export default function WebDAVPage({ onBack }: Props) {
  const webdavConfig = useSettingsStore((s) => s.webdavConfig);
  const updateWebDAVConfig = useSettingsStore((s) => s.updateWebDAVConfig);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [remoteFiles, setRemoteFiles] = useState<WebDAVFileInfo[]>([]);
  const [includeKeys, setIncludeKeys] = useState(false);

  const handleTest = async () => {
    if (!webdavConfig.url) { setResult({ ok: false, msg: '请先填写服务器地址' }); return; }
    setResult(null);
    setBusy(true);
    const r = await testConnection(webdavConfig);
    r.ok ? setResult({ ok: true, msg: '连接成功' }) : setResult({ ok: false, msg: r.error || '连接失败' });
    setBusy(false);
  };

  const handleList = async () => {
    if (!webdavConfig.url) { setResult({ ok: false, msg: '请先填写服务器地址' }); return; }
    setResult(null);
    setBusy(true);
    try {
      const files = await listBackups(webdavConfig);
      setRemoteFiles(files);
      setResult({ ok: true, msg: `找到 ${files.length} 个备份文件` });
    } catch (err) {
      setResult({ ok: false, msg: (err as Error).message });
    }
    setBusy(false);
  };

  const handleUpload = async () => {
    setResult(null);
    setBusy(true);
    try {
      const blob = await createBackup(includeKeys);
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `backup_${timestamp}.zip`;
      await uploadBackup(webdavConfig, filename, blob);
      setResult({ ok: true, msg: `已上传 ${filename}` });
      handleList();
    } catch (err) {
      setResult({ ok: false, msg: (err as Error).message });
    }
    setBusy(false);
  };

  const handleRestore = async (file: WebDAVFileInfo) => {
    if (!window.confirm(`确定从 ${file.name} 恢复数据？当前数据将被覆盖，此操作不可撤销。`)) return;
    setResult(null);
    setBusy(true);
    try {
      const blob = await downloadBackup(webdavConfig, file.name);
      const zipFile = new File([blob], file.name, { type: 'application/zip' });
      const { restored } = await restoreFromZip(zipFile);
      setResult({ ok: true, msg: `恢复成功！已还原：${restored.join('、')}\n即将重新加载…` });
      // 恢复后重新加载页面，使 Zustand stores 从新 SQLite 重新读取数据（类 RikkaHub exitProcess(0)）
      setTimeout(() => { window.location.reload(); }, 1500);
    } catch (err) {
      setResult({ ok: false, msg: `恢复失败: ${(err as Error).message}` });
    }
    setBusy(false);
  };

  const handleDelete = async (file: WebDAVFileInfo) => {
    if (!window.confirm(`确定删除 ${file.name}？`)) return;
    setResult(null);
    setBusy(true);
    try {
      await deleteBackup(webdavConfig, file.name);
      setResult({ ok: true, msg: `已删除 ${file.name}` });
      handleList();
    } catch (err) {
      setResult({ ok: false, msg: (err as Error).message });
    }
    setBusy(false);
  };

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <button className="back-btn" onClick={onBack}><CaretLeft size={18} /> 返回</button>
        <h1>WebDAV 同步</h1>
      </div>

      <div className="settings-page__body">
        {/* 配置表单 */}
        <div className="settings-section">
          <div className="settings-form">
            <label className="settings-field">
              <span>服务器地址</span>
              <input type="url" value={webdavConfig.url}
                onChange={(e) => updateWebDAVConfig({ url: e.target.value })}
                placeholder="https://example.com/remote.php/dav/files/user/" />
            </label>
            <label className="settings-field">
              <span>用户名</span>
              <input type="text" value={webdavConfig.username}
                onChange={(e) => updateWebDAVConfig({ username: e.target.value })}
                placeholder="WebDAV 用户名" />
            </label>
            <label className="settings-field">
              <span>密码</span>
              <input type="password" value={webdavConfig.password}
                onChange={(e) => updateWebDAVConfig({ password: e.target.value })}
                placeholder="WebDAV 密码" />
            </label>
            <label className="settings-field">
              <span>远程路径</span>
              <input type="text" value={webdavConfig.remotePath}
                onChange={(e) => updateWebDAVConfig({ remotePath: e.target.value })}
                placeholder="bananamilkphone_backups/" />
            </label>

            <div className="settings-btn-row" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="theme-btn" onClick={handleTest} disabled={busy}>
                测试连接
              </button>
              <button className="theme-btn" onClick={handleList} disabled={busy}>
                列出备份
              </button>
            </div>
          </div>
        </div>

        {/* 上传区域 */}
        <div className="settings-section">
          <h3>上传备份</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeKeys}
              onChange={(e) => setIncludeKeys(e.target.checked)} />
            <span>包含 API Key</span>
          </label>
          <button className="theme-btn theme-btn--primary" onClick={handleUpload} disabled={busy}>
            <CloudArrowUp size={18} /> 上传到 WebDAV
          </button>
        </div>

        {/* 远程文件列表 */}
        {remoteFiles.length > 0 && (
          <div className="settings-section">
            <h3>远程备份文件</h3>
            <div className="settings-file-list">
              {remoteFiles.map((file) => (
                <div key={file.name} className="settings-file-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--app-border)' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{file.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                      {(file.size / 1024).toFixed(1)} KB · {file.lastModified}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="theme-btn" onClick={() => handleRestore(file)} disabled={busy}>恢复</button>
                    <button className="theme-btn theme-btn--danger" onClick={() => handleDelete(file)} disabled={busy}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 结果 */}
        {result && (
          <div className={`settings-backup-result ${result.ok ? 'settings-backup-result--ok' : 'settings-backup-result--err'}`}>
            {result.ok ? <CheckCircle size={18} weight="fill" /> : <XCircle size={18} weight="fill" />} {result.msg}
          </div>
        )}
      </div>

      <div className="settings-page__footer">
        <button className="theme-btn" onClick={onBack}>确认</button>
        <button className="theme-btn theme-btn--cancel" onClick={onBack}>取消</button>
      </div>
    </div>
  );
}
