import { useEffect } from 'react';
import { useGalleryStore } from '../store/gallery-store';

interface Props { roomId: string; }

export default function TrashPage({ roomId }: Props) {
  const snapshots = useGalleryStore((s) => s.snapshots);
  const loadSnapshots = useGalleryStore((s) => s.loadSnapshots);

  useEffect(() => {
    loadSnapshots(roomId);
  }, [roomId, loadSnapshots]);

  const oldVersions = snapshots.filter((s) => s.integrated === -1);
  const pending = snapshots.filter((s) => s.integrated === 0);

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
      <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>回收站</h4>
      <p style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
        管理被拒绝的变更和旧版本记忆
      </p>

      <div style={{ marginBottom: 20 }}>
        <h5 style={{ margin: '0 0 6px', fontSize: 13 }}>未处理（{pending.length}）</h5>
        {pending.length === 0 ? (
          <p style={{ fontSize: 12, color: '#999' }}>无待处理项</p>
        ) : (
          <p style={{ fontSize: 12, color: '#f59e0b' }}>
            有 {pending.length} 条待审批，请前往「审批」页面处理
          </p>
        )}
      </div>

      <div>
        <h5 style={{ margin: '0 0 6px', fontSize: 13 }}>已拒绝的版本（{oldVersions.length}）</h5>
        {oldVersions.length === 0 ? (
          <p style={{ fontSize: 12, color: '#999' }}>没有已拒绝的版本</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {oldVersions.map((snap) => (
              <div key={snap.id} style={{
                padding: '6px 10px', borderRadius: 6, fontSize: 12,
                background: 'var(--app-surface, #f8f9fa)',
                border: '1px solid var(--border, #e5e7eb)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                  background: '#fee2e2', color: '#991b1b',
                }}>
                  {snap.action === 'created' ? '创建' : snap.action === 'modified' ? '修改' : '删除'}
                </span>
                <span style={{ flex: 1, color: '#666' }}>{new Date(snap.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <p style={{ fontSize: 11, color: '#999', fontStyle: 'italic' }}>
          回收站暂不支持永久删除操作，后续版本将提供批量清理功能
        </p>
      </div>
    </div>
  );
}
