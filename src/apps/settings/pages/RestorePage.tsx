import { useState, useRef } from 'react';
import { UploadSimple, CaretLeft, CheckCircle, XCircle, Warning } from '@phosphor-icons/react';
import JSZip from 'jszip';
import { restoreFromZip, type BackupManifest } from '../../../services/backup/index';

interface Props {
  onBack: () => void;
}

export default function RestorePage({ onBack }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [manifest, setManifest] = useState<BackupManifest | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [restored, setRestored] = useState<string[]>([]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setManifest(null);
    setResult(null);

    // 读取 manifest 预览
    try {
      const zip = await JSZip.loadAsync(file);
      const mf = zip.file('manifest.json');
      if (!mf) throw new Error('无效的备份文件');
      const text = await mf.async('text');
      setManifest(JSON.parse(text));
    } catch (err) {
      setResult({ ok: false, msg: `无法读取备份文件: ${(err as Error).message}` });
    }
  };

  const handleRestore = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    const confirmed = window.confirm(
      '⚠️ 恢复数据将覆盖当前所有数据！\n\n此操作不可撤销，确定继续？'
    );
    if (!confirmed) return;

    setBusy(true);
    setResult(null);
    try {
      const { restored } = await restoreFromZip(file);
      setRestored(restored);
      setResult({
        ok: true,
        msg: `已恢复 ${restored.length} 个数据项。刷新页面后生效。`,
      });
    } catch (err) {
      setResult({ ok: false, msg: `恢复失败: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <button className="back-btn" onClick={onBack}><CaretLeft size={18} /></button>
        <h1>本地恢复</h1>
      </div>

      <div className="settings-page__body">
        <div className="settings-section">
          <p className="settings-section__desc">
            从之前备份的 Zip 文件中恢复数据。
          </p>

          {/* 文件选择 */}
          <div className="settings-backup-cta">
            <UploadSimple size={48} className="settings-backup-cta__icon" />
            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <button
              className="theme-btn"
              onClick={() => fileRef.current?.click()}
            >
              选择备份文件
            </button>
          </div>

          {/* 预览 */}
          {manifest && (
            <div className="settings-card">
              <h3 className="settings-card__title">备份信息</h3>
              <div className="settings-card__info">
                <div className="settings-card__info-row">
                  <span>备份时间</span>
                  <span>{new Date(manifest.createdAt).toLocaleString('zh-CN')}</span>
                </div>
                <div className="settings-card__info-row">
                  <span>APP 版本</span>
                  <span>{manifest.appVersion}</span>
                </div>
                <div className="settings-card__info-row">
                  <span>包含 Key</span>
                  <span>{manifest.includedKeys ? '是' : '否'}</span>
                </div>
                <div className="settings-card__info-row">
                  <span>数据库大小</span>
                  <span>{(manifest.databaseSize / 1024).toFixed(1)} KB</span>
                </div>
              </div>

              <button
                className="theme-btn theme-btn--danger"
                onClick={handleRestore}
                disabled={busy}
                style={{ marginTop: 8, width: '100%' }}
              >
                {busy ? '正在恢复…' : <><Warning size={18} weight="fill" /> 开始恢复</>}
              </button>
            </div>
          )}

          {/* 恢复结果 */}
          {result && (
            <div className={`settings-backup-result ${result.ok ? 'settings-backup-result--ok' : 'settings-backup-result--err'}`}>
              {result.ok ? <CheckCircle size={18} weight="fill" /> : <XCircle size={18} weight="fill" />} {result.msg}
            </div>
          )}

          {restored.length > 0 && (
            <div className="settings-field__hint settings-field__hint--ok" style={{ marginTop: 8 }}>
              已恢复: {restored.join(', ')}
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
