import { useCallback, useMemo, useRef, useReducer, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../store/app-store';
import AppIcon from './AppIcon';
import type { AppMeta } from '../../../types';

// ── 常量 ──
const COLS = 4;
const ROWS = 6;
const PAGE_SIZE = COLS * ROWS;
const LONG_PRESS_MS = 400;
const SWIPE_THRESHOLD_PX = 10;
const EDGE_ZONE_PCT = 0.12; // 屏幕宽度 12%
const EDGE_FIRST_MS = 350; // 首次翻页延迟
// const EDGE_REPEAT_MS = 200; // 连续翻页（已禁用：每次入边只翻一页）
const SWIPE_SNAP_PCT = 0.3; // 滑动超过 30% 切页
const SWIPE_VELOCITY_THRESHOLD = 0.5; // 快速滑动阈值 px/ms

// ── 拖拽状态机 ──
type DragPhase = 'idle' | 'pressing' | 'swiping' | 'dragging';

interface DragState {
  phase: DragPhase;
  currentPage: number;
  totalPages: number;
  sourceIdx: number | null;      // 初始槽位（渲染虚线框用，不变）
  draggedAppId: string | null;   // 被拖拽的 APP id
  pointerStartX: number;
  pointerStartY: number;
  pointerId: number;
  swipeStartX: number;
  swipeOffset: number;
  lastCollisionIdx: number | null;
  lastMoveTime: number;
  lastMoveX: number;
}

const INITIAL_DRAG: DragState = {
  phase: 'idle',
  currentPage: 0,
  totalPages: 0,
  sourceIdx: null,
  draggedAppId: null,
  pointerStartX: 0,
  pointerStartY: 0,
  pointerId: -1,
  swipeStartX: 0,
  swipeOffset: 0,
  lastCollisionIdx: null,
  lastMoveTime: 0,
  lastMoveX: 0,
};

type DragAction =
  | { type: 'PRESS_START'; x: number; y: number; pointerId: number; page: number; totalPages: number }
  | { type: 'PRESS_MOVE'; x: number; y: number }
  | { type: 'ENTER_DRAG'; sourceIdx: number; appId: string }
  | { type: 'ENTER_SWIPE' }
  | { type: 'DRAG_MOVE'; page: number; totalPages: number; collisionIdx: number | null }
  | { type: 'SWIPE_MOVE'; offset: number }
  | { type: 'DROP'; page: number }
  | { type: 'CANCEL' };

function dragReducer(state: DragState, action: DragAction): DragState {
  switch (action.type) {
    case 'PRESS_START':
      return {
        ...INITIAL_DRAG,
        phase: 'pressing',
        pointerStartX: action.x,
        pointerStartY: action.y,
        pointerId: action.pointerId,
        currentPage: action.page,
        totalPages: action.totalPages,
        swipeStartX: action.x,
        lastMoveTime: Date.now(),
        lastMoveX: action.x,
      };

    case 'PRESS_MOVE': {
      if (state.phase !== 'pressing') return state;
      const dx = action.x - state.pointerStartX;
      const dy = action.y - state.pointerStartY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > SWIPE_THRESHOLD_PX) {
        return {
          ...state,
          phase: 'swiping',
          swipeStartX: action.x,
          swipeOffset: action.x - state.swipeStartX,
        };
      }
      return state;
    }

    case 'ENTER_DRAG':
      return {
        ...state,
        phase: 'dragging',
        sourceIdx: action.sourceIdx,
        draggedAppId: action.appId,
        lastCollisionIdx: action.sourceIdx,
      };

    case 'ENTER_SWIPE':
      return { ...state, phase: 'swiping' };

    case 'DRAG_MOVE':
      return {
        ...state,
        currentPage: action.page,
        totalPages: action.totalPages,
        lastCollisionIdx: action.collisionIdx,
      };

    case 'SWIPE_MOVE':
      return {
        ...state,
        swipeOffset: action.offset,
        lastMoveTime: Date.now(),
        lastMoveX: action.offset + state.swipeStartX,
      };

    case 'DROP':
      return {
        ...state,
        phase: 'idle',
        currentPage: action.page,
        sourceIdx: null,
        draggedAppId: null,
        lastCollisionIdx: null,
        swipeOffset: 0,
      };

    case 'CANCEL':
      return { ...INITIAL_DRAG, totalPages: state.totalPages };

    default:
      return state;
  }
}

// ── 辅助函数 ──

/** 屏幕坐标 → 全局槽位索引 */
function pointToSlot(
  x: number,
  y: number,
  gridRect: DOMRect,
  page: number
): number | null {
  const cellW = gridRect.width / COLS;
  const cellH = gridRect.height / ROWS;
  const col = Math.floor((x - gridRect.left) / cellW);
  const row = Math.floor((y - gridRect.top) / cellH);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return page * PAGE_SIZE + row * COLS + col;
}

/** 找最近空位（BFS 曼哈顿距离），跨页搜索 */
function findNearestEmpty(
  grid: (string | null)[],
  fromIdx: number,
  totalSlots: number
): number | null {
  const totalPages = Math.ceil(totalSlots / PAGE_SIZE);
  const fromPage = Math.floor(fromIdx / PAGE_SIZE);
  const fromRow = Math.floor((fromIdx % PAGE_SIZE) / COLS);
  const fromCol = fromIdx % COLS;

  // 先检查同页
  for (let dist = 1; dist <= COLS + ROWS; dist++) {
    for (let dr = -dist; dr <= dist; dr++) {
      const row = fromRow + dr;
      if (row < 0 || row >= ROWS) continue;
      const remaining = dist - Math.abs(dr);
      for (const dc of remaining === 0 ? [0] : [-remaining, remaining]) {
        const col = fromCol + dc;
        if (col < 0 || col >= COLS) continue;
        const idx = fromPage * PAGE_SIZE + row * COLS + col;
        if (idx >= 0 && idx < totalSlots && grid[idx] === null) return idx;
      }
    }
  }

  // 跨页搜索
  for (let p = 0; p < totalPages; p++) {
    if (p === fromPage) continue;
    for (let idx = p * PAGE_SIZE; idx < Math.min((p + 1) * PAGE_SIZE, totalSlots); idx++) {
      if (grid[idx] === null) return idx;
    }
  }

  return null;
}

/** 执行「挤走」：source 移到 target，target 图标被推到最近空位 */
function pushIcon(
  grid: (string | null)[],
  sourceIdx: number,
  targetIdx: number,
  totalSlots: number
): (string | null)[] {
  if (sourceIdx === targetIdx) return grid;
  const next = [...grid];
  const displaced = next[targetIdx];
  next[targetIdx] = next[sourceIdx];
  next[sourceIdx] = null;

  if (displaced !== null) {
    const empty = findNearestEmpty(next, targetIdx, totalSlots);
    if (empty !== null) {
      next[empty] = displaced;
    } else {
      // 没有空位了，追加到末尾（建新页）
      next.push(displaced);
      // 补齐到整页
      while (next.length % PAGE_SIZE !== 0) next.push(null);
    }
  }

  return next;
}

// ── 组件 ──

export default function AppGrid() {
  const navigate = useNavigate();
  const apps = useAppStore((s) => s.apps);
  const desktopGrid = useAppStore((s) => s.desktopGrid);
  const customIcons = useAppStore((s) => s.customIcons);

  // ── 分页计算 ──
  const totalSlots = useMemo(() => {
    const raw = desktopGrid.length;
    // 至少显示所有已注册 APP（包括那些不在 grid 中的）
    const appCount = apps.length;
    return Math.max(raw, Math.ceil(appCount / PAGE_SIZE) * PAGE_SIZE, PAGE_SIZE);
  }, [desktopGrid.length, apps.length]);

  const totalPages = useMemo(() => Math.ceil(totalSlots / PAGE_SIZE), [totalSlots]);

  // ── 拖拽状态 ──
  const [drag, dispatch] = useReducer(dragReducer, { ...INITIAL_DRAG, totalPages });

  // ── Refs ──
  const gridRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const ghostPos = useRef({ x: 0, y: 0 });
  const isInEdge = useRef(false);
  const snapPage = useRef(0);
  const lastCollisionTime = useRef(0);
  // 事件处理器中同步读写的 refs（绕过 React dispatch 异步问题）
  const phaseRef = useRef<DragPhase>('idle');
  const swipeStartXRef = useRef(0);
  const swipeOffsetRef = useRef(0);
  const currentPageRef = useRef(0);
  const pressStartXRef = useRef(0);
  const pressStartYRef = useRef(0);
  const pointerIdRef = useRef(-1);
  const sourceIdxRef = useRef<number | null>(null);
  const draggedAppIdRef = useRef<string | null>(null);
  const lastCollisionIdxRef = useRef<number | null>(null);
  const lastMoveTimeRef = useRef(0);
  const lastMoveXRef = useRef(0);

  // ── 同步缺少的 APP 到 grid ──
  useEffect(() => {
    const missing = apps.filter((a) => !desktopGrid.includes(a.id));
    if (missing.length > 0) {
      useAppStore.setState((prev) => {
        const next = [...prev.desktopGrid];
        for (const m of missing) {
          const emptyIdx = next.indexOf(null);
          if (emptyIdx !== -1) {
            next[emptyIdx] = m.id;
          } else {
            next.push(m.id);
          }
        }
        return { desktopGrid: next };
      });
    }
  }, [apps, desktopGrid]);

  // ── 修剪尾部空页 ──
  const trimmedTotalPages = useMemo(() => {
    const effective = [...desktopGrid];
    // 找到最后一个非 null 的位置
    let lastNonEmpty = -1;
    for (let i = effective.length - 1; i >= 0; i--) {
      if (effective[i] !== null) {
        lastNonEmpty = i;
        break;
      }
    }
    if (lastNonEmpty < 0) return 1;
    return Math.max(1, Math.floor(lastNonEmpty / PAGE_SIZE) + 1);
  }, [desktopGrid]);

  // ── 构建页面数据 ──
  const pages = useMemo(() => {
    const result: ((AppMeta | null)[])[] = [];
    for (let p = 0; p < trimmedTotalPages; p++) {
      const page: (AppMeta | null)[] = [];
      for (let c = 0; c < PAGE_SIZE; c++) {
        const globalIdx = p * PAGE_SIZE + c;
        const appId = globalIdx < desktopGrid.length ? desktopGrid[globalIdx] : null;
        const app = appId ? apps.find((a) => a.id === appId) ?? null : null;
        page.push(app);
      }
      result.push(page);
    }
    return result;
  }, [desktopGrid, apps, trimmedTotalPages]);

  const displayPage = Math.min(drag.currentPage, Math.max(0, trimmedTotalPages - 1));

  const sourceApp = drag.draggedAppId
    ? apps.find((a) => a.id === drag.draggedAppId) ?? null
    : null;

  // ── 清理定时器 ──
  const clearTimers = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (edgeTimer.current) { clearTimeout(edgeTimer.current); edgeTimer.current = null; }
    if (edgeInterval.current) { clearInterval(edgeInterval.current); edgeInterval.current = null; }
  }, []);

  // ── 碰撞检测 ──
  // （逻辑已内联到 handlePointerMove 中，使用 refs 同步读写）

  // ── Pointer Events ──
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const iconEl = target.closest('[data-slot-idx]');

    e.preventDefault();
    gridRef.current?.setPointerCapture(e.pointerId);

    // 同步写入 refs
    pressStartXRef.current = e.clientX;
    pressStartYRef.current = e.clientY;
    swipeStartXRef.current = e.clientX;
    swipeOffsetRef.current = 0;
    pointerIdRef.current = e.pointerId;
    currentPageRef.current = displayPage;
    lastMoveTimeRef.current = Date.now();
    lastMoveXRef.current = e.clientX;

    if (iconEl) {
      // 按下图标 → 进入 pressing
      const slotIdx = parseInt(iconEl.getAttribute('data-slot-idx')!, 10);
      const appId = slotIdx < desktopGrid.length ? desktopGrid[slotIdx] : null;
      if (!appId) { phaseRef.current = 'idle'; return; }

      phaseRef.current = 'pressing';
      sourceIdxRef.current = slotIdx;

      dispatch({
        type: 'PRESS_START', x: e.clientX, y: e.clientY,
        pointerId: e.pointerId, page: displayPage, totalPages: trimmedTotalPages,
      });

      longPressTimer.current = setTimeout(() => {
        phaseRef.current = 'dragging';
        draggedAppIdRef.current = appId;
        lastCollisionIdxRef.current = slotIdx;
        dispatch({ type: 'ENTER_DRAG', sourceIdx: slotIdx, appId });

        const iconRect = iconEl.getBoundingClientRect();
        ghostPos.current = {
          x: iconRect.left + iconRect.width / 2 - 36,
          y: iconRect.top - 20,
        };
        if (ghostRef.current) {
          ghostRef.current.style.display = 'block';
          ghostRef.current.style.transform = `translate(${ghostPos.current.x}px, ${ghostPos.current.y}px)`;
        }
      }, LONG_PRESS_MS);
    } else {
      // 按下空白区域 → 直接进入滑动，用 DOM 直控 track
      phaseRef.current = 'swiping';
      // 关掉 track 的 CSS transition 以跟手
      if (trackRef.current) trackRef.current.style.transition = 'none';
    }
  }, [desktopGrid, displayPage, trimmedTotalPages]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const phase = phaseRef.current;
    if (phase === 'idle') return;

    if (phase === 'pressing') {
      const dx = e.clientX - pressStartXRef.current;
      const dy = e.clientY - pressStartYRef.current;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      // 只有水平滑动超过阈值 且 水平位移 > 2倍垂直位移，才进入 swiping
      // 避免上下轻微偏移导致误退出拖拽等待
      if (absDx > SWIPE_THRESHOLD_PX && absDx > absDy * 2) {
        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
        phaseRef.current = 'swiping';
        swipeStartXRef.current = e.clientX;
        swipeOffsetRef.current = e.clientX - swipeStartXRef.current;
        lastMoveTimeRef.current = Date.now();
        lastMoveXRef.current = e.clientX;
        if (trackRef.current) trackRef.current.style.transition = 'none';
        dispatch({ type: 'ENTER_SWIPE' });
      }
      dispatch({ type: 'PRESS_MOVE', x: e.clientX, y: e.clientY });
      return;
    }

    if (phase === 'swiping') {
      swipeOffsetRef.current = e.clientX - swipeStartXRef.current;
      lastMoveTimeRef.current = Date.now();
      lastMoveXRef.current = e.clientX;
      // 直接操作 track DOM（不经过 React，保证跟手）
      if (trackRef.current) {
        trackRef.current.style.transform = `translateX(calc(${-currentPageRef.current * 100}% + ${swipeOffsetRef.current}px))`;
      }
      return;
    }

    if (phase === 'dragging') {
      ghostPos.current = { x: e.clientX - 36, y: e.clientY - 60 };
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate(${ghostPos.current.x}px, ${ghostPos.current.y}px)`;
      }
      // 碰撞（使用 ref 中的 draggedAppId 和 currentPage）
      const appId = draggedAppIdRef.current;
      if (appId) {
        const now = Date.now();
        if (now - lastCollisionTime.current >= 40) {
          lastCollisionTime.current = now;
          const grid = gridRef.current;
          if (grid) {
            const rect = grid.getBoundingClientRect();
            const targetIdx = pointToSlot(e.clientX, e.clientY, rect, currentPageRef.current);
            if (targetIdx !== null && targetIdx !== lastCollisionIdxRef.current) {
              const currentSrc = desktopGrid.indexOf(appId);
              if (currentSrc !== -1 && currentSrc !== targetIdx) {
                lastCollisionIdxRef.current = targetIdx;
                dispatch({ type: 'DRAG_MOVE', page: currentPageRef.current, totalPages: trimmedTotalPages, collisionIdx: targetIdx });
                useAppStore.setState((prev) => {
                  const ga = [...prev.desktopGrid];
                  while (ga.length <= Math.max(targetIdx, currentSrc)) ga.push(null);
                  return { desktopGrid: pushIcon(ga, currentSrc, targetIdx, ga.length) };
                });
              }
            }
          }
        }
      }
      // 边缘翻页（每次进入边缘只翻一次，不连续翻页）
      const sw = window.innerWidth;
      const edgeW = sw * EDGE_ZONE_PCT;
      const atRight = e.clientX > sw - edgeW;
      const atLeft = e.clientX < edgeW;
      if (!atRight && !atLeft) {
        isInEdge.current = false;
        if (edgeTimer.current) { clearTimeout(edgeTimer.current); edgeTimer.current = null; }
      } else if (!isInEdge.current) {
        isInEdge.current = true;
        edgeTimer.current = setTimeout(() => {
          const dir = atRight ? 1 : -1;
          const pg = currentPageRef.current;
          const newPage = dir === 1 && pg >= trimmedTotalPages - 1
            ? pg + 1
            : Math.max(0, Math.min(trimmedTotalPages - 1, pg + dir));
          currentPageRef.current = newPage;
          dispatch({ type: 'DRAG_MOVE', page: newPage, totalPages: Math.max(trimmedTotalPages, newPage + 1), collisionIdx: null });
        }, EDGE_FIRST_MS);
      }
    }
  }, [desktopGrid, trimmedTotalPages]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    clearTimers();
    isInEdge.current = false;
    const phase = phaseRef.current;

    if (phase === 'swiping') {
      const offset = swipeOffsetRef.current;
      const elapsed = Math.max(1, Date.now() - lastMoveTimeRef.current);
      const prevX = lastMoveXRef.current;
      const velocity = (e.clientX - prevX) / elapsed;
      const absOffset = Math.abs(offset);
      const absVelocity = Math.abs(velocity);
      let newPage = currentPageRef.current;
      if (absOffset > window.innerWidth * SWIPE_SNAP_PCT || absVelocity > SWIPE_VELOCITY_THRESHOLD) {
        if (offset > 0 && currentPageRef.current > 0) newPage = currentPageRef.current - 1;
        else if (offset < 0 && currentPageRef.current < trimmedTotalPages - 1) newPage = currentPageRef.current + 1;
      }
      newPage = Math.min(newPage, Math.max(0, trimmedTotalPages - 1));
      snapPage.current = newPage;
      currentPageRef.current = newPage;
      // 恢复 CSS transition 做弹回/切页动画，然后同步 React state
      if (trackRef.current) {
        trackRef.current.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        trackRef.current.style.transform = `translateX(${-newPage * 100}%)`;
      }
      dispatch({ type: 'DROP', page: newPage });
    } else if (phase === 'dragging') {
      if (ghostRef.current) ghostRef.current.style.display = 'none';
      const clampedPage = Math.min(currentPageRef.current, Math.max(0, trimmedTotalPages - 1));
      currentPageRef.current = clampedPage;
      dispatch({ type: 'DROP', page: clampedPage });
    } else if (phase === 'pressing') {
      const dx = e.clientX - pressStartXRef.current;
      const dy = e.clientY - pressStartYRef.current;
      if (Math.sqrt(dx * dx + dy * dy) < SWIPE_THRESHOLD_PX) {
        const slotEl = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
        const iconEl = slotEl?.closest('[data-slot-idx]');
        if (iconEl) {
          const idx = parseInt(iconEl.getAttribute('data-slot-idx')!, 10);
          const appId = idx < desktopGrid.length ? desktopGrid[idx] : null;
          const app = appId ? apps.find((a) => a.id === appId) : null;
          if (app) { navigate(app.route); phaseRef.current = 'idle'; dispatch({ type: 'CANCEL' }); return; }
        }
      }
      dispatch({ type: 'CANCEL' });
    }

    phaseRef.current = 'idle';
    sourceIdxRef.current = null;
    draggedAppIdRef.current = null;
    lastCollisionIdxRef.current = null;
    swipeOffsetRef.current = 0;

    try { gridRef.current?.releasePointerCapture(e.pointerId); } catch (_) {}
  }, [clearTimers, trimmedTotalPages, desktopGrid, apps, navigate]);

  const handlePointerCancel = useCallback(() => {
    clearTimers();
    isInEdge.current = false;
    phaseRef.current = 'idle';
    sourceIdxRef.current = null;
    draggedAppIdRef.current = null;
    if (ghostRef.current) ghostRef.current.style.display = 'none';
    dispatch({ type: 'CANCEL' });
  }, [clearTimers]);

  // ── 计算 track translateX ──
  const trackTransform = useMemo(() => {
    return `translateX(${-displayPage * 100}%)`;
  }, [displayPage]);

  const trackTransition = drag.phase === 'swiping' || drag.phase === 'dragging'
    ? 'none'
    : 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

  // 非滑动阶段同步 track 位置（滑动时 handlePointerMove 直接操作 DOM）
  useEffect(() => {
    if (phaseRef.current !== 'swiping' && trackRef.current) {
      trackRef.current.style.transition = trackTransition;
      trackRef.current.style.transform = trackTransform;
    }
  }, [trackTransform, trackTransition]);

  // ── Render ──
  return (
    <div
      ref={gridRef}
      className="app-grid"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={(e) => { if (drag.phase === 'dragging') e.preventDefault(); }}
      style={{ touchAction: drag.phase === 'idle' ? 'pan-y' : 'none' }}
    >
      {/* 页面轨道 */}
      <div
        ref={trackRef}
        className="app-grid__track"
      >
        {pages.map((page, pageIdx) => (
          <div key={pageIdx} className="app-grid__page">
            {page.map((app, colIdx) => {
              const globalIdx = pageIdx * PAGE_SIZE + colIdx;
              const isDragging = drag.phase === 'dragging';
              const isSourceSlot = isDragging && drag.sourceIdx === globalIdx;

              if (isSourceSlot) {
                // 拖拽源头 — 显示虚线框占位
                return (
                  <div
                    key={`source-${globalIdx}`}
                    className="app-grid__slot app-grid__slot--source"
                    data-slot-idx={globalIdx}
                  >
                    <div className="app-grid__slot-ghost-placeholder" />
                  </div>
                );
              }

              if (!app) {
                return (
                  <div
                    key={`empty-${globalIdx}`}
                    className="app-grid__slot app-grid__slot--empty"
                    data-slot-idx={globalIdx}
                  />
                );
              }

              const appId = desktopGrid[globalIdx];
              const customIcon = appId ? customIcons[appId] : undefined;

              return (
                <div
                  key={appId ?? `icon-${globalIdx}`}
                  className={`app-grid__slot${customIcon ? ' app-grid__slot--custom-icon' : ''}`}
                  data-slot-idx={globalIdx}
                >
                  <div className="app-grid__icon-wrap">
                    <AppIcon app={app} />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Ghost 浮层 */}
      <div
        ref={ghostRef}
        className="app-grid__ghost"
        style={{ display: 'none', position: 'fixed', left: 0, top: 0, zIndex: 1000, pointerEvents: 'none' }}
      >
        {sourceApp && (
          <div className="app-grid__ghost-inner">
            <div className="app-grid__ghost-icon">
              {(customIcons[sourceApp.id]
                ? <img src={customIcons[sourceApp.id]} alt={sourceApp.name} />
                : sourceApp.icon
              )}
            </div>
            <span className="app-grid__ghost-label">{sourceApp.name}</span>
          </div>
        )}
      </div>

      {/* 分页圆点 */}
      {trimmedTotalPages > 1 && (
        <div className="app-grid__dots">
          {Array.from({ length: trimmedTotalPages }, (_, i) => (
            <button
              key={i}
              className={`app-grid__dot${i === displayPage ? ' app-grid__dot--active' : ''}`}
              onClick={() => {
                if (drag.phase === 'idle') {
                  snapPage.current = i;
                  dispatch({ type: 'DROP', page: i });
                }
              }}
              aria-label={`第 ${i + 1} 页`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
