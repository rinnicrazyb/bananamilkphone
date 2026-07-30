import { useState, useEffect } from 'react';
import { useGalleryStore } from '../store/gallery-store';
import * as db from '../store/gallery-db';
import type { GallerySnapshot } from '../types';

interface Props { roomId: string; }

const styles = {
  text: { color: 'var(--app-text)' },
  textSec: { color: 'var(--app-text-secondary)' },
  surface: 'var(--app-bg-card)',
  border: 'var(--app-border)',
  badge: (action: string) => ({
    created: { bg: 'rgba(16,185,129,0.12)', fg: 'rgb(16,185,129)' },
    modified: { bg: 'rgba(245,158,11,0.12)', fg: 'rgb(245,158,11)' },
    deleted: { bg: 'rgba(239,68,68,0.12)', fg: 'rgb(239,68,68)' },
  }[action] || { bg: 'var(--app-secondary)', fg: 'var(--app-text-secondary)' }),
  diffBefore: { bg: 'rgba(239,68,68,0.06)', fg: 'rgb(239,68,68)' },
  diffAfter: { bg: 'rgba(16,185,129,0.06)', fg: 'rgb(16,185,129)' },
};

export default function ReviewPage({ roomId }: Props) {
  const snapshots = useGalleryStore((s) => s.snapshots);
  const loadSnapshots = useGalleryStore((s) => s.loadSnapshots);
  const updateSnapshot = useGalleryStore((s) => s.updateSnapshot);
  const [selectedSnap, setSelectedSnap] = useState<GallerySnapshot | null>(null);

  useEffect(() => {
    loadSnapshots(roomId);
  }, [roomId, loadSnapshots]);

  const pendingSnaps = snapshots.filter((s) => s.integrated === 0);
  const historySnaps = snapshots.filter((s) => s.integrated !== 0);

  const handleIntegrate = async (id: string, integrated: number) => {
    await db.updateSnapshot(id, integrated);
    updateSnapshot(id, integrated);
    setSelectedSnap(null);
  };

  return (
    <div style={{ padding: 16, overflow: 'auto', color: 'var(--app-text)' }}>
      {/* 待审批 */}
      <h4 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--app-text)' }}>待审批</h4>
      {pendingSnaps.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--app-text-secondary)', marginBottom: 16 }}>没有待审批的变更</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {pendingSnaps.map((snap) => {
            const badge = styles.badge(snap.action);
            const isOpen = selectedSnap?.id === snap.id;
            return (
              <div key={snap.id}
                onClick={() => setSelectedSnap(isOpen ? null : snap)}
                style={{
                  padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                  background: isOpen ? 'var(--app-secondary)' : 'var(--app-bg-card)',
                  border: '1px solid var(--app-border)',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{
                    padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: badge.bg, color: badge.fg,
                  }}>
                    {snap.action === 'created' ? '创建' : snap.action === 'modified' ? '修改' : '删除'}
                  </span>
                  <span style={{ flex: 1, color: 'var(--app-text)' }}>
                    {snap.nodeId ? `节点 ${snap.nodeId.slice(-6)}` : '全局操作'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--app-text-secondary)' }}>
                    {new Date(snap.createdAt).toLocaleString()}
                  </span>
                </div>

                {isOpen && (
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 4, color: styles.diffBefore.fg }}>修改前</div>
                        <pre style={{
                          margin: 0, padding: 6, background: styles.diffBefore.bg, borderRadius: 4,
                          fontSize: 11, maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap',
                          color: 'var(--app-text)',
                        }}>{snap.beforeContent || '（空）'}</pre>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 4, color: styles.diffAfter.fg }}>修改后</div>
                        <pre style={{
                          margin: 0, padding: 6, background: styles.diffAfter.bg, borderRadius: 4,
                          fontSize: 11, maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap',
                          color: 'var(--app-text)',
                        }}>{snap.afterContent || '（空）'}</pre>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="theme-btn" style={{ fontSize: 12, padding: '4px 12px', background: 'rgb(16,185,129)', color: '#fff', border: 'none' }}
                        onClick={() => handleIntegrate(snap.id, 1)}>接受</button>
                      <button className="theme-btn theme-btn--cancel" style={{ fontSize: 12, padding: '4px 12px' }}
                        onClick={() => handleIntegrate(snap.id, -1)}>拒绝</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 历史记录 */}
      <h4 style={{ margin: '16px 0 8px', fontSize: 14, color: 'var(--app-text)' }}>历史记录</h4>
      {historySnaps.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>暂无历史记录</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {historySnaps.map((snap) => {
            const badge = styles.badge(snap.integrated === 1 ? 'created' : 'deleted');
            return (
              <div key={snap.id} style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12,
                background: 'var(--app-bg-card)', opacity: 0.7,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                  background: badge.bg, color: badge.fg,
                }}>
                  {snap.integrated === 1 ? '已接受' : '已拒绝'}
                </span>
                <span style={{ flex: 1, color: 'var(--app-text-secondary)' }}>
                  {new Date(snap.createdAt).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
