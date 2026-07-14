import { useCallback, useMemo, useRef } from 'react';
import { useAppStore } from '../../../store/app-store';
import AppIcon from './AppIcon';

const GRID_COLS = 4;
const GRID_ROWS = 6;
const PAGE_SIZE = GRID_COLS * GRID_ROWS;

export default function AppGrid() {
  const apps = useAppStore((s) => s.apps);
  const desktopOrder = useAppStore((s) => s.desktopOrder);
  const setDesktopOrder = useAppStore((s) => s.setDesktopOrder);
  const dragIdRef = useRef<string | null>(null);

  // 按 desktopOrder 排序，未排序的 APP 放后面
  const sortedApps = useMemo(() => {
    const ordered = desktopOrder
      .map((id) => apps.find((a) => a.id === id))
      .filter(Boolean) as typeof apps;
    const remaining = apps.filter((a) => !desktopOrder.includes(a.id));
    return [...ordered, ...remaining];
  }, [apps, desktopOrder]);

  // 分页
  const filledPages = useMemo(() => {
    const result: (typeof sortedApps)[] = [];
    for (let i = 0; i < sortedApps.length; i += PAGE_SIZE) {
      result.push(sortedApps.slice(i, i + PAGE_SIZE));
    }
    if (result.length === 0) result.push([]);
    return result.map((page) => {
      const filled: (typeof sortedApps[number] | null)[] = [...page];
      while (filled.length < PAGE_SIZE) filled.push(null);
      return filled;
    });
  }, [sortedApps]);

  // 拖拽排序：交换目标位置
  const handleDrop = useCallback(
    (targetId: string) => {
      const dragId = dragIdRef.current;
      if (!dragId || dragId === targetId) return;

      const allIds = sortedApps.map((a) => a.id);
      const dragIdx = allIds.indexOf(dragId);
      const targetIdx = allIds.indexOf(targetId);
      if (dragIdx === -1 || targetIdx === -1) return;

      const newOrder = [...allIds];
      [newOrder[dragIdx], newOrder[targetIdx]] = [
        newOrder[targetIdx],
        newOrder[dragIdx],
      ];
      setDesktopOrder(newOrder);
      dragIdRef.current = null;
    },
    [sortedApps, setDesktopOrder]
  );

  const handleDragStart = useCallback((id: string) => {
    dragIdRef.current = id;
  }, []);

  return (
    <div className="app-grid">
      {filledPages.map((page, pageIdx) => (
        <div
          key={pageIdx}
          className="app-grid__page"
          style={{ display: pageIdx === 0 ? 'grid' : 'none' }}
        >
          {page.map((app, idx) =>
            app ? (
              <AppIcon
                key={app.id}
                app={app}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
              />
            ) : (
              <div key={`empty-${idx}`} className="app-icon app-icon--empty" />
            )
          )}
        </div>
      ))}
    </div>
  );
}
