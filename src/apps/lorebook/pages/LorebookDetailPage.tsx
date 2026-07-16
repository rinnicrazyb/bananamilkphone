/**
 * 世界书详情页 — 翻页式阅读体验
 *
 * 设计：像翻一本书
 * - 第1页：封面（书封 + 名称 + 描述 + 启用开关 + 绑定信息）
 * - 第2页：目录（条目列表，显示名称+关键词+状态）
 * - 第3页起：每条条目一页（完整信息）
 *
 * 翻页：手势左右滑动 + 底部左右箭头
 * 侧边栏：左边缘向右滑出，显示条目列表
 */
import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CaretLeft,
  CaretRight,
  List,
  PencilSimple,
  Trash,
  Plus,
  UploadSimple,
} from '@phosphor-icons/react';
import { useLorebookStore } from '../store/lorebook-store';
import { useChatStore } from '../../chat/store/chat-store';
import { createDefaultEntry } from '../types';
import EntryEditorDialog from '../components/EntryEditorDialog';
import type { LorebookEntry } from '../types';

type PageType = 'cover' | 'toc' | 'entry';

interface PageInfo {
  type: PageType;
  entryIndex?: number;
}

export default function LorebookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const lorebooks = useLorebookStore((s) => s.lorebooks);
  const updateLorebook = useLorebookStore((s) => s.updateLorebook);
  const removeLorebook = useLorebookStore((s) => s.removeLorebook);
  const addEntry = useLorebookStore((s) => s.addEntry);
  const updateEntry = useLorebookStore((s) => s.updateEntry);
  const removeEntry = useLorebookStore((s) => s.removeEntry);
  const agents = useChatStore((s) => s.agents);

  const book = lorebooks.find((b) => b.id === id);
  const [currentPage, setCurrentPage] = useState<PageInfo>({ type: 'cover' });
  const [showSidebar, setShowSidebar] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LorebookEntry | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editInfo, setEditInfo] = useState<{ name: string; description: string } | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // 触摸翻页
  const touchStartX = useRef(0);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const diff = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(diff) < 50) return;
      if (diff > 0) prevPage();
      else nextPage();
    },
    [currentPage, book]
  );

  if (!book) {
    return (
      <div className="lorebook-page">
        <div className="lorebook-page__header">
          <button className="theme-btn" onClick={() => navigate('/lorebook')}>
            ← 返回
          </button>
          <h1>世界书未找到</h1>
        </div>
      </div>
    );
  }

  const totalEntries = book.entries.length;
  const totalPages = 2 + totalEntries;

  function getPageIndex(p: PageInfo): number {
    if (p.type === 'cover') return 0;
    if (p.type === 'toc') return 1;
    return 2 + (p.entryIndex ?? 0);
  }

  function pageFromIndex(idx: number): PageInfo {
    if (idx <= 0) return { type: 'cover' };
    if (idx === 1) return { type: 'toc' };
    const entryIdx = idx - 2;
    if (entryIdx < totalEntries) return { type: 'entry', entryIndex: entryIdx };
    return { type: 'cover' };
  }

  function nextPage() {
    const cur = getPageIndex(currentPage);
    const next = Math.min(cur + 1, totalPages - 1);
    setCurrentPage(pageFromIndex(next));
  }

  function prevPage() {
    const cur = getPageIndex(currentPage);
    const prev = Math.max(cur - 1, 0);
    setCurrentPage(pageFromIndex(prev));
  }

  function goToEntry(index: number) {
    setCurrentPage({ type: 'entry', entryIndex: index });
    setShowSidebar(false);
  }

  // 添加条目
  const handleAddEntry = () => {
    const entry = createDefaultEntry({ name: `条目 ${book.entries.length + 1}` });
    addEntry(book.id, entry);
    setCurrentPage({ type: 'entry', entryIndex: book.entries.length });
  };

  // 删除世界书
  const handleDeleteBook = () => {
    removeLorebook(book.id);
    navigate('/lorebook');
  };

  // 上传书封
  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      updateLorebook(book.id, { cover: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  // 查找绑定了这本世界书的智能体
  const boundAgentNames = agents
    .filter((a) => a.settings?.worldBookIds?.includes(book.id))
    .map((a) => a.name);

  const pageIndex = getPageIndex(currentPage);

  return (
    <div
      className="lorebook-detail"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 顶部导航 */}
      <div className="lorebook-detail__topbar">
        <button className="theme-btn" onClick={() => navigate('/lorebook')}>
          ← 返回
        </button>
        <span className="lorebook-detail__page-num">
          {pageIndex + 1} / {totalPages}
        </span>
        <button className="theme-btn" onClick={() => setShowSidebar(!showSidebar)}>
          <List size={20} />
        </button>
      </div>

      {/* 主体区域 */}
      <div className="lorebook-detail__content">
        {/* 封面页 */}
        {currentPage.type === 'cover' && (
          <div className="lorebook-detail__page lorebook-cover">
            <div className="lorebook-cover__image" onClick={() => coverInputRef.current?.click()}>
              {book.cover ? (
                <img src={book.cover} alt={book.name} />
              ) : (
                <div className="lorebook-cover__image--default">
                  <span className="lorebook-cover__initial">
                    {book.name ? book.name.charAt(0).toUpperCase() : '?'}
                  </span>
                </div>
              )}
              <div className="lorebook-cover__image-overlay">
                <UploadSimple size={24} />
              </div>
            </div>
            <input
              type="file"
              accept="image/*"
              ref={coverInputRef}
              onChange={handleCoverUpload}
              hidden
            />

            <h1 className="lorebook-cover__title">{book.name || '未命名世界书'}</h1>
            {book.description && (
              <p className="lorebook-cover__desc">{book.description}</p>
            )}

            <div className="lorebook-cover__actions">
              <label className="lorebook-cover__switch">
                <span>启用</span>
                <input
                  type="checkbox"
                  checked={book.enabled}
                  onChange={(e) => updateLorebook(book.id, { enabled: e.target.checked })}
                />
              </label>

              <button
                className="theme-btn lorebook-cover__edit-btn"
                onClick={() => setEditInfo({ name: book.name, description: book.description })}
              >
                <PencilSimple size={16} />
                编辑信息
              </button>

              <button
                className="theme-btn theme-btn--danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash size={16} />
                删除世界书
              </button>
            </div>

            <div className="lorebook-cover__meta">
              {book.entries.length} 条条目 · 创建于 {new Date(book.createdAt).toLocaleDateString()}
            </div>

            {boundAgentNames.length > 0 && (
              <div className="lorebook-cover__bound">
                已绑定到：{boundAgentNames.join('、')}
              </div>
            )}
          </div>
        )}

        {/* 目录页 */}
        {currentPage.type === 'toc' && (
          <div className="lorebook-detail__page lorebook-toc">
            <h2>目录</h2>
            {book.entries.length === 0 ? (
              <p className="lorebook-toc__empty">暂无条目，点击下方按钮添加</p>
            ) : (
              <div className="lorebook-toc__list">
                {book.entries.map((entry, idx) => (
                  <div
                    key={entry.id}
                    className="lorebook-toc__item"
                    onClick={() => goToEntry(idx)}
                  >
                    <span className="lorebook-toc__num">{idx + 1}</span>
                    <div className="lorebook-toc__info">
                      <span className="lorebook-toc__name">
                        {entry.name || '未命名条目'}
                      </span>
                      <span className="lorebook-toc__keywords">
                        {entry.keywords.slice(0, 3).join(', ')}
                        {entry.keywords.length > 3 && ` +${entry.keywords.length - 3}`}
                      </span>
                    </div>
                    <span
                      className={`lorebook-toc__status ${entry.enabled ? 'active' : ''}`}
                    />
                  </div>
                ))}
              </div>
            )}
            <button className="theme-btn theme-btn--primary" onClick={handleAddEntry}>
              <Plus size={16} />
              添加条目
            </button>
          </div>
        )}

        {/* 条目页 */}
        {currentPage.type === 'entry' && currentPage.entryIndex !== undefined && (
          <EntryPage
            entry={book.entries[currentPage.entryIndex]}
            entryIndex={currentPage.entryIndex}
            totalEntries={totalEntries}
            onEdit={(entry) => setEditingEntry(entry)}
            onDelete={(id) => {
              removeEntry(book.id, id);
              if (currentPage.entryIndex! >= book.entries.length - 1) {
                setCurrentPage({ type: 'toc' });
              }
            }}
          />
        )}
      </div>

      {/* 底部翻页箭头 */}
      <div className="lorebook-detail__nav">
        <button className="theme-btn" onClick={prevPage} disabled={pageIndex === 0}>
          <CaretLeft size={20} />
        </button>
        <button className="theme-btn" onClick={nextPage} disabled={pageIndex >= totalPages - 1}>
          <CaretRight size={20} />
        </button>
      </div>

      {/* 侧边栏遮罩 */}
      {showSidebar && (
        <div className="lorebook-detail__sidebar-overlay" onClick={() => setShowSidebar(false)} />
      )}

      {/* 侧边栏 */}
      <div className={`lorebook-detail__sidebar ${showSidebar ? 'open' : ''}`}>
        <div className="lorebook-detail__sidebar-header">
          <h3>{book.name}</h3>
          <button className="theme-btn" onClick={() => setShowSidebar(false)}>✕</button>
        </div>
        <div className="lorebook-detail__sidebar-list">
          <div
            className={`lorebook-detail__sidebar-item ${pageIndex === 0 ? 'active' : ''}`}
            onClick={() => { setCurrentPage({ type: 'cover' }); setShowSidebar(false); }}
          >
            <span className="lorebook-detail__sidebar-num">0</span>封面
          </div>
          <div
            className={`lorebook-detail__sidebar-item ${pageIndex === 1 ? 'active' : ''}`}
            onClick={() => { setCurrentPage({ type: 'toc' }); setShowSidebar(false); }}
          >
            <span className="lorebook-detail__sidebar-num">i</span>目录
          </div>
          {book.entries.map((entry, idx) => (
            <div
              key={entry.id}
              className={`lorebook-detail__sidebar-item ${pageIndex === idx + 2 ? 'active' : ''}`}
              onClick={() => goToEntry(idx)}
            >
              <span className={`lorebook-detail__sidebar-dot ${entry.enabled ? 'active' : ''}`} />
              <span className="lorebook-detail__sidebar-entry-name">
                {entry.name || `条目 ${idx + 1}`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 条目编辑弹窗 */}
      {editingEntry && (
        <EntryEditorDialog
          entry={editingEntry}
          onSave={(updated) => {
            updateEntry(book.id, editingEntry.id, updated);
            setEditingEntry(null);
          }}
          onClose={() => setEditingEntry(null)}
        />
      )}

      {/* 编辑信息弹窗 */}
      {editInfo && (
        <div className="lorebook-detail__confirm-overlay" onClick={() => setEditInfo(null)}>
          <div className="lorebook-detail__confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 18, textAlign: 'center' }}>编辑世界书信息</h3>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
              <span>名称</span>
              <input
                type="text"
                value={editInfo.name}
                onChange={(e) => setEditInfo({ ...editInfo, name: e.target.value })}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--app-border)', fontSize: 14 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
              <span>简介</span>
              <textarea
                value={editInfo.description}
                onChange={(e) => setEditInfo({ ...editInfo, description: e.target.value })}
                rows={4}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--app-border)', fontSize: 14, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </label>
            <div className="lorebook-detail__confirm-actions">
              <button className="theme-btn" onClick={() => setEditInfo(null)}>取消</button>
              <button className="theme-btn theme-btn--primary" onClick={() => {
                updateLorebook(book.id, { name: editInfo.name, description: editInfo.description });
                setEditInfo(null);
              }}>确认</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="lorebook-detail__confirm-overlay">
          <div className="lorebook-detail__confirm-dialog">
            <p>确定删除「{book.name}」及其所有条目？</p>
            <div className="lorebook-detail__confirm-actions">
              <button className="theme-btn" onClick={() => setShowDeleteConfirm(false)}>取消</button>
              <button className="theme-btn theme-btn--danger" onClick={handleDeleteBook}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 单条条目页面 */
function EntryPage({
  entry, entryIndex, totalEntries, onEdit, onDelete,
}: {
  entry: LorebookEntry; entryIndex: number; totalEntries: number;
  onEdit: (e: LorebookEntry) => void; onDelete: (id: string) => void;
}) {
  return (
    <div className="lorebook-detail__page lorebook-entry-page">
      <div className="lorebook-entry-page__header">
        <h2>{entry.name || '未命名条目'}</h2>
        <span className="lorebook-entry-page__num">条目 {entryIndex + 1} / {totalEntries}</span>
      </div>

      <div className="lorebook-entry-page__meta">
        <div className="lorebook-entry-page__tag">位置: {POSITION_LABELS[entry.position] || entry.position}</div>
        <div className="lorebook-entry-page__tag">优先级: {entry.priority}</div>
        <div className="lorebook-entry-page__tag">角色: {entry.role === 'assistant' ? 'AI' : '用户'}</div>
        {entry.constantActive ? (
          <div className="lorebook-entry-page__tag lorebook-entry-page__tag--active">常驻激活</div>
        ) : (
          <div className="lorebook-entry-page__tag">关键词: {entry.keywords.join(', ') || '无'}</div>
        )}
        {entry.useRegex && <div className="lorebook-entry-page__tag">正则匹配</div>}
        <div className="lorebook-entry-page__tag">扫描深度: {entry.scanDepth}</div>
      </div>

      <div className="lorebook-entry-page__content">
        <h4>注入内容</h4>
        <pre>{entry.content || '（空）'}</pre>
      </div>

      <div className="lorebook-entry-page__actions">
        <button className="theme-btn" onClick={() => onEdit(entry)}><PencilSimple size={16} /> 编辑</button>
        <button className="theme-btn theme-btn--danger" onClick={() => onDelete(entry.id)}><Trash size={16} /> 删除</button>
      </div>
    </div>
  );
}

const POSITION_LABELS: Record<string, string> = {
  BEFORE_SYSTEM_PROMPT: '系统提示词前',
  AFTER_SYSTEM_PROMPT: '系统提示词后',
  TOP_OF_CHAT: '对话开头',
  BOTTOM_OF_CHAT: '最新消息前',
  AT_DEPTH: '指定深度',
};
