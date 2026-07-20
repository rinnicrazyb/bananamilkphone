/**
 * 世界书列表页（书架）
 *
 * 设计：网格布局，一行 2 本书，书封卡片
 * 排序：按编辑时间降序
 * 功能：新建、导入、导出
 */
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpenText, Plus, DownloadSimple, FileArrowUp } from '@phosphor-icons/react';
import { useLorebookStore } from '../store/lorebook-store';
import { createDefaultLorebook } from '../types';
import type { Lorebook } from '../types';

export default function LorebookListPage() {
  const navigate = useNavigate();
  const lorebooks = useLorebookStore((s) => s.lorebooks);
  const addLorebook = useLorebookStore((s) => s.addLorebook);
  const [showOptions, setShowOptions] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleCreate = () => {
    const book = createDefaultLorebook({ name: '新建世界书' });
    addLorebook(book);
    navigate(`/lorebook/${book.id}`);
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        // 校验：确保是合法的世界书对象
        if (!data || typeof data !== 'object' || !data.name) {
          alert('导入失败：文件格式不正确，请选择有效的世界书 JSON 文件。');
          return;
        }
        const book: Lorebook = {
          id: data.id || `lorebook_import_${Date.now()}`,
          name: data.name || '导入的世界书',
          description: data.description || '',
          cover: data.cover || '',
          enabled: data.enabled ?? true,
          entries: Array.isArray(data.entries) ? data.entries : [],
          createdAt: data.createdAt || Date.now(),
          updatedAt: Date.now(),
        };
        addLorebook(book);
        navigate(`/lorebook/${book.id}`);
      } catch {
        alert('导入失败：无法解析 JSON 文件。');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExport = (book: Lorebook) => {
    const json = JSON.stringify(book, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${book.name || '世界书'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 按编辑时间降序排列
  const sorted = [...lorebooks].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="lorebook-page">
      <div className="lorebook-page__header">
        <button className="theme-btn" onClick={() => navigate('/')}>
          ← 返回
        </button>
        <h1>世界书</h1>
      </div>

      <div className="lorebook-shelf">
        {sorted.length === 0 ? (
          <div className="lorebook-shelf__empty">
            <BookOpenText size={48} />
            <p>暂无世界书</p>
            <small>点击下方按钮创建第一本世界书</small>
          </div>
        ) : (
          <div className="lorebook-shelf__grid">
            {sorted.map((book) => (
              <LorebookCard
                key={book.id}
                book={book}
                onClick={() => navigate(`/lorebook/${book.id}`)}
                onExport={() => handleExport(book)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 添加/导入按钮 */}
      {showOptions ? (
        <div className="lorebook-page__fab-group">
          <button className="theme-btn theme-btn--primary lorebook-page__fab-option" onClick={() => { setShowOptions(false); handleCreate(); }}>
            <Plus size={20} weight="bold" />
            <span>新建</span>
          </button>
          <button className="theme-btn lorebook-page__fab-option" onClick={() => { setShowOptions(false); handleImportClick(); }}>
            <FileArrowUp size={20} />
            <span>导入已有</span>
          </button>
          <button className="theme-btn theme-btn--cancel lorebook-page__fab-close" onClick={() => setShowOptions(false)}>
            取消
          </button>
        </div>
      ) : (
        <button className="lorebook-page__fab theme-btn theme-btn--primary" onClick={() => setShowOptions(true)}>
          <Plus size={20} weight="bold" />
          <span>添加世界书</span>
        </button>
      )}

      {/* 隐藏的文件输入（导入 JSON） */}
      <input ref={importInputRef} type="file" accept=".json" onChange={handleImportFile} hidden />
    </div>
  );
}

function LorebookCard({ book, onClick, onExport }: { book: Lorebook; onClick: () => void; onExport: () => void }) {
  return (
    <div className="lorebook-card">
      <div className="lorebook-card__cover-wrap" onClick={onClick}>
        {book.cover ? (
          <img className="lorebook-card__cover" src={book.cover} alt={book.name} />
        ) : (
          <div className="lorebook-card__cover lorebook-card__cover--default">
            <BookOpenText size={32} />
          </div>
        )}
        {!book.enabled && (
          <span className="lorebook-card__badge">已禁用</span>
        )}
      </div>
      <div className="lorebook-card__info" onClick={onClick}>
        <h3 className="lorebook-card__title">
          {book.name || '未命名世界书'}
        </h3>
        {book.description && (
          <p className="lorebook-card__desc">{book.description}</p>
        )}
        <span className="lorebook-card__meta">
          {book.entries.length} 条条目
        </span>
      </div>
      <button className="lorebook-card__export" onClick={(e) => { e.stopPropagation(); onExport(); }} title="导出">
        <DownloadSimple size={16} />
      </button>
    </div>
  );
}
