import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  DndContext,
  useDraggable,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useAppStore } from '../../../store/app-store';
import AppIcon from './AppIcon';

const GRID_COLS = 4;
const GRID_ROWS = 6;
const PAGE_SIZE = GRID_COLS * GRID_ROWS;
const SWIPE_THRESHOLD = 60;
const EDGE_AUTO_SCROLL_MS = 400;
const EDGE_ZONE = 40;
const COLLISION_THROTTLE_MS = 40;

/** 单个网格单元：有图标时可拖拽，无图标时空占位 */
function DraggableCell({
  app,
  globalIdx,
  isDragOverlay,
}: {
  app: ReturnType<typeof useAppStore.getState>['apps'][number] | null;
  globalIdx: number;
  isDragOverlay?: boolean;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: app?.id ?? `cell-${globalIdx}`,
    disabled: !app,
  });

  if (!app) {
    return <div className="app-icon app-icon--empty" />;
  }

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      {...(isDragOverlay ? {} : listeners)}
      {...(isDragOverlay ? {} : attributes)}
      className={`app-icon ${isDragging ? 'app-icon--dragging' : ''}`}
    >
      <AppIcon app={app} />
    </div>
  );
}

/** 手指位置 → 网格索引（基于 grid 容器视口坐标，不受 track translateX 影响） */
function calcGlobalIdx(
  cx: number,
  cy: number,
  gridEl: HTMLElement,
  currentPage: number
): number {
  const rect = gridEl.getBoundingClientRect();
  const cellW = rect.width / GRID_COLS;
  const cellH = rect.height / GRID_ROWS;
  const col = Math.max(0, Math.min(GRID_COLS - 1, Math.floor((cx - rect.left) / cellW)));
  const row = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor((cy - rect.top) / cellH)));
  return currentPage * PAGE_SIZE + row * GRID_COLS + col;
}

export default function AppGrid() {
  const apps = useAppStore((s) => s.apps);
  const desktopOrder = useAppStore((s) => s.desktopOrder);
  const customIcons = useAppStore((s) => s.customIcons);

  // --- page & swipe state ---
  const [currentPage, setCurrentPage] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);

  // dnd-kit overlay state
  const [activeId, setActiveId] = useState<string | null>(null);

  // refs
  const gridRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef({ startX: 0, startY: 0, isSwiping: false });
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasTriggeredEdgeRef = useRef(false);
  const lastCollisionUpdate = useRef(0);
  const lastValidGlobalIdxRef = useRef<number | null>(null);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const dndActiveRef = useRef(false);

  // --- pages computed from sparse desktopOrder ---
  const totalSlots = useMemo(
    () => Math.max(PAGE_SIZE * 3, desktopOrder.length),
    [desktopOrder.length]
  );
  const totalPages = useMemo(() => Math.ceil(totalSlots / PAGE_SIZE), [totalSlots]);
  const clampedPage = Math.min(currentPage, Math.max(0, totalPages - 1));
  const visiblePages = Math.max(1, totalPages);

  const pages = useMemo(() => {
    const count = visiblePages;
    const result: (typeof apps[number] | null)[][] = [];
    for (let p = 0; p < count; p++) {
      const page: (typeof apps[number] | null)[] = [];
      for (let c = 0; c < PAGE_SIZE; c++) {
        const globalIdx = p * PAGE_SIZE + c;
        const appId = globalIdx < desktopOrder.length ? desktopOrder[globalIdx] : '';
        const app = appId ? apps.find((a) => a.id === appId) ?? null : null;
        page.push(app);
      }
      result.push(page);
    }
    // Trim trailing empty pages (keep min 1)
    while (result.length > 1 && result[result.length - 1].every((a) => a === null)) {
      result.pop();
    }
    return result;
  }, [desktopOrder, apps, visiblePages]);

  const renderPages = pages.length;

  // --- side effects ---
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    el.style.touchAction = activeId ? 'none' : 'pan-y';
  }, [activeId]);

  useEffect(() => {
    if (currentPage >= renderPages) {
      setCurrentPage(Math.max(0, renderPages - 1));
    }
  }, [renderPages, currentPage]);

  // Sync: add any apps missing from desktopOrder into empty slots
  useEffect(() => {
    const missing = apps.filter((a) => !desktopOrder.includes(a.id));
    if (missing.length > 0) {
      useAppStore.setState((prev) => {
        const next = [...prev.desktopOrder];
        for (const m of missing) {
          const emptyIdx = next.indexOf('');
          if (emptyIdx !== -1) next[emptyIdx] = m.id;
          else next.push(m.id);
        }
        return { desktopOrder: next };
      });
    }
  }, [apps, desktopOrder]);

  // --- dnd-kit sensors (long-press for touch, click-drag for mouse) ---
  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: { delay: 500, tolerance: 10 },
    }),
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // --- helpers ---
  const clearEdgeTimer = useCallback(() => {
    if (edgeTimer.current) {
      clearTimeout(edgeTimer.current);
      edgeTimer.current = null;
    }
  }, []);

  // --- dnd-kit callbacks ---
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      setActiveId(id);
      dndActiveRef.current = true;
      // 记录起始位置（用于 onDragMove 计算 delta）
      const ev = event.active.rect.current?.initial;
      if (ev) {
        dragStartPosRef.current = { x: ev.left, y: ev.top };
      }
    },
    []
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const grid = gridRef.current;
      if (!grid) return;
      const id = String(event.active.id);
      const { delta } = event;

      // 根据起始位置 + delta 计算当前手指坐标
      const cx = dragStartPosRef.current.x + delta.x;
      const cy = dragStartPosRef.current.y + delta.y;

      // 碰撞检测（节流）
      const now = Date.now();
      if (now - lastCollisionUpdate.current > COLLISION_THROTTLE_MS) {
        lastCollisionUpdate.current = now;
        const gi = calcGlobalIdx(cx, cy, grid, clampedPage);
        if (gi !== -1) {
          lastValidGlobalIdxRef.current = gi;
          // 执行交换
          useAppStore.setState((prev) => {
            const oldIdx = prev.desktopOrder.indexOf(id);
            if (oldIdx === -1 || oldIdx === gi) return {};
            const next = [...prev.desktopOrder];
            while (next.length <= gi) next.push('');
            next[oldIdx] = next[gi];
            next[gi] = id;
            return { desktopOrder: next };
          });
        }
      }

      // 边缘检测 + 自动翻页
      const sw = window.innerWidth;
      const isLastPage = clampedPage >= renderPages - 1;
      const atRight = cx > sw - EDGE_ZONE;
      const atLeft = cx < EDGE_ZONE;

      if (atRight && isLastPage && !edgeTimer.current && !hasTriggeredEdgeRef.current) {
        edgeTimer.current = setTimeout(() => {
          setCurrentPage((p) => Math.min(renderPages - 1, p + 1));
          hasTriggeredEdgeRef.current = true;
          clearEdgeTimer();
        }, EDGE_AUTO_SCROLL_MS);
      } else if (atRight && !isLastPage && !edgeTimer.current && !hasTriggeredEdgeRef.current) {
        edgeTimer.current = setTimeout(() => {
          setCurrentPage((p) => Math.min(renderPages - 1, p + 1));
          hasTriggeredEdgeRef.current = true;
          clearEdgeTimer();
        }, EDGE_AUTO_SCROLL_MS);
      } else if (atLeft && clampedPage > 0 && !edgeTimer.current && !hasTriggeredEdgeRef.current) {
        edgeTimer.current = setTimeout(() => {
          setCurrentPage((p) => Math.max(0, p - 1));
          hasTriggeredEdgeRef.current = true;
          clearEdgeTimer();
        }, EDGE_AUTO_SCROLL_MS);
      } else if (!atRight && !atLeft) {
        clearEdgeTimer();
        hasTriggeredEdgeRef.current = false;
      }
    },
    [clampedPage, renderPages, clearEdgeTimer]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const id = String(event.active.id);
      // 最终碰撞提交
      const lastGi = lastValidGlobalIdxRef.current;
      if (lastGi !== null) {
        useAppStore.setState((prev) => {
          const oldIdx = prev.desktopOrder.indexOf(id);
          if (oldIdx === -1 || oldIdx === lastGi) return {};
          const next = [...prev.desktopOrder];
          while (next.length <= lastGi) next.push('');
          next[oldIdx] = next[lastGi];
          next[lastGi] = id;
          return { desktopOrder: next };
        });
      }
      // 清理
      setActiveId(null);
      dndActiveRef.current = false;
      lastValidGlobalIdxRef.current = null;
      lastCollisionUpdate.current = 0;
      hasTriggeredEdgeRef.current = false;
      clearEdgeTimer();
    },
    [clearEdgeTimer]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    dndActiveRef.current = false;
    lastValidGlobalIdxRef.current = null;
    lastCollisionUpdate.current = 0;
    hasTriggeredEdgeRef.current = false;
    clearEdgeTimer();
  }, [clearEdgeTimer]);

  // --- swipe touch handlers (synthetic, only for page swipe, not drag) ---
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (dndActiveRef.current) return;
    const t = e.touches[0];
    touchRef.current = { startX: t.clientX, startY: t.clientY, isSwiping: false };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dndActiveRef.current) return;
    const t = e.touches[0];
    const state = touchRef.current;

    if (!state.isSwiping) {
      const dx = t.clientX - state.startX;
      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        state.isSwiping = true;
      }
    }

    if (state.isSwiping) {
      setSwipeOffset(t.clientX - state.startX);
      setIsSwiping(true);
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (dndActiveRef.current) return;
    const state = touchRef.current;

    if (state.isSwiping) {
      const dx = e.changedTouches[0].clientX - state.startX;
      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        if (dx < 0 && clampedPage < renderPages - 1) {
          setCurrentPage(clampedPage + 1);
        } else if (dx > 0 && clampedPage > 0) {
          setCurrentPage(clampedPage - 1);
        }
      }
      setIsSwiping(false);
      setSwipeOffset(0);
    }

    touchRef.current.isSwiping = false;
  }, [clampedPage, renderPages]);

  const handleDotClick = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const translateX = isSwiping
    ? `calc(${-clampedPage * 100}% + ${swipeOffset}px)`
    : `${-clampedPage * 100}%`;

  const activeApp = activeId ? apps.find((a) => a.id === activeId) ?? null : null;
  const customIcon = activeId ? customIcons[activeId] : undefined;

  // --- render ---
  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        ref={gridRef}
        className="app-grid"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(e) => { if (activeId) e.preventDefault(); }}
      >
        <div
          ref={trackRef}
          className={`app-grid__track${isSwiping ? ' app-grid__track--swiping' : ''}`}
          style={{ transform: `translateX(${translateX})`, transition: activeId ? 'none' : undefined }}
        >
          {pages.map((page, pageIdx) => (
            <div key={pageIdx} className="app-grid__page">
              {page.map((app, idx) => {
                const globalIdx = pageIdx * PAGE_SIZE + idx;
                return (
                  <DraggableCell
                    key={app?.id ?? `empty-${globalIdx}`}
                    app={app}
                    globalIdx={globalIdx}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* drag ghost — dnd-kit DragOverlay (portal,不在 grid DOM 树内) */}
        <DragOverlay>
          {activeApp ? (
            <div className="app-icon app-icon--drag-ghost">
              <div
                className="app-icon__image"
                style={
                  customIcon
                    ? { backgroundImage: `url(${customIcon})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : undefined
                }
              >
                {!customIcon && activeApp.icon}
              </div>
              <span className="app-icon__label">{activeApp.name}</span>
            </div>
          ) : null}
        </DragOverlay>

        {renderPages > 1 && (
          <div className="app-grid__dots">
            {Array.from({ length: renderPages }, (_, i) => (
              <button
                key={i}
                className={`app-grid__dot${i === clampedPage ? ' app-grid__dot--active' : ''}`}
                onClick={() => handleDotClick(i)}
                aria-label={`第 ${i + 1} 页`}
              />
            ))}
          </div>
        )}
      </div>
    </DndContext>
  );
}
