/**
 * 世界书列表页（书架）
 *
 * 设计：网格布局，一行 2 本书，书封卡片
 * 排序：按编辑时间降序
 */
import { useNavigate } from 'react-router-dom';
import { BookOpenText, Plus } from '@phosphor-icons/react';
import { useLorebookStore } from '../store/lorebook-store';
import { createDefaultLorebook } from '../types';
import type { Lorebook } from '../types';

export default function LorebookListPage() {
  const navigate = useNavigate();
  const lorebooks = useLorebookStore((s) => s.lorebooks);
  const addLorebook = useLorebookStore((s) => s.addLorebook);

  const handleCreate = () => {
    const book = createDefaultLorebook({ name: '新建世界书' });
    addLorebook(book);
    navigate(`/lorebook/${book.id}`);
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
              />
            ))}
          </div>
        )}
      </div>

      <button
        className="lorebook-page__fab theme-btn theme-btn--primary"
        onClick={handleCreate}
      >
        <Plus size={20} weight="bold" />
        <span>添加世界书</span>
      </button>
    </div>
  );
}

function LorebookCard({ book, onClick }: { book: Lorebook; onClick: () => void }) {
  return (
    <div className="lorebook-card" onClick={onClick}>
      <div className="lorebook-card__cover-wrap">
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
      <div className="lorebook-card__info">
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
    </div>
  );
}
