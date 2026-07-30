import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash as TrashIcon, Folder, FileText, CaretRight, House } from '@phosphor-icons/react';
import { useGalleryStore } from '../store/gallery-store';
import { VALID_DOMAINS, DEFAULT_DOMAIN } from '../types';
import type { GalleryNode } from '../types';
import * as db from '../store/gallery-db';

function genId(): string { return `gn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

interface Props { roomId: string; }

export default function MemoryBrowser({ roomId }: Props) {
  const nodes = useGalleryStore((s) => s.nodes);
  const loadNodes = useGalleryStore((s) => s.loadNodes);
  const addNode = useGalleryStore((s) => s.addNode);
  const updateNode = useGalleryStore((s) => s.updateNode);
  const deleteNodeAction = useGalleryStore((s) => s.deleteNode);
  const addSnapshot = useGalleryStore((s) => s.addSnapshot);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const expandedDomains = useRef<Set<string>>(new Set([DEFAULT_DOMAIN])).current;
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editDisclosure, setEditDisclosure] = useState('');
  const [editPriority, setEditPriority] = useState(2);
  const [editing, setEditing] = useState(false);
  const [breadcrumb, setBreadcrumb] = useState<{ id: string | null; label: string }[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const touchStartX = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── 右滑打开/关闭侧边栏（document 级监听）──
  useEffect(() => {
    const onStart = (e: TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      if (dx > 60 && !drawerOpen) setDrawerOpen(true);
      if (dx < -60 && drawerOpen) setDrawerOpen(false);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [drawerOpen]);

  useEffect(() => { loadNodes(roomId); }, [roomId, loadNodes]);

  const selectedNode = nodes.find((n) => n.id === selectedId);
  const getChildren = (parentId: string | null) => nodes.filter((n) => n.parentId === parentId);
  const getDomainRoots = (domain: string) => nodes.filter((n) => n.parentId === null && n.domain === domain);

  // ── 面包屑 ──
  useEffect(() => {
    if (!selectedId) { setBreadcrumb([]); return; }
    const crumbs: { id: string | null; label: string }[] = [];
    let current: GalleryNode | undefined = selectedNode;
    while (current) {
      crumbs.unshift({ id: current.id, label: current.title || current.path });
      current = current.parentId ? nodes.find((n) => n.id === current!.parentId) : undefined;
    }
    setBreadcrumb(crumbs);
  }, [selectedId, selectedNode, nodes]);

  // ── 选中节点 ──
  const handleSelect = useCallback((node: GalleryNode) => {
    setSelectedId(node.id);
    setEditTitle(node.title);
    setEditContent(node.content);
    setEditDisclosure(node.disclosure);
    setEditPriority(node.priority);
    setEditing(false);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
      return next;
    });
  }, []);

  const handleBreadcrumbNav = (nodeId: string | null) => {
    if (nodeId === null) { setSelectedId(null); return; }
    const node = nodes.find((n) => n.id === nodeId);
    if (node) handleSelect(node);
  };

  // ── 新建 ──
  const handleCreate = async (parentId: string | null, domain: string) => {
    const node: GalleryNode = {
      id: genId(), roomId, parentId, domain,
      path: `新记忆-${Date.now()}`,
      content: '', priority: 2, disclosure: '', title: '',
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    await db.saveNode(node);
    addNode(node);
    setSelectedId(node.id);
    setEditContent(''); setEditTitle(''); setEditDisclosure(''); setEditPriority(2);
    setEditing(true);
  };

  // ── 保存 ──
  const handleSave = async () => {
    if (!selectedNode) return;
    const beforeContent = selectedNode.content;
    const afterContent = editContent;
    await db.saveNode({ ...selectedNode, content: editContent, title: editTitle, disclosure: editDisclosure, priority: editPriority, updatedAt: Date.now() });
    updateNode(selectedNode.id, { content: editContent, title: editTitle, disclosure: editDisclosure, priority: editPriority, updatedAt: Date.now() });
    // 创建快照
    if (beforeContent !== afterContent) {
      const snap = {
        id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        roomId, nodeId: selectedNode.id,
        action: 'modified' as const,
        beforeContent, afterContent,
        beforeMeta: '{}', afterMeta: '{}',
        createdAt: Date.now(), integrated: 0,
      };
      await db.saveSnapshot(snap);
      addSnapshot(snap);
    }
    setEditing(false);
  };

  // ── 删除 ──
  const handleDelete = async () => {
    if (!selectedNode) return;
    const snap = {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      roomId, nodeId: selectedNode.id,
      action: 'deleted' as const,
      beforeContent: selectedNode.content, afterContent: '',
      beforeMeta: '{}', afterMeta: '{}',
      createdAt: Date.now(), integrated: 0,
    };
    await db.saveSnapshot(snap);
    addSnapshot(snap);
    await deleteNodeAction(selectedNode.id);
    setSelectedId(null);
    setEditing(false);
  };

  // ── 子节点卡片网格 ──
  const children = selectedId ? getChildren(selectedId) : [];
  const showCardGrid = selectedId && children.length > 0;
  const showEditor = selectedId && !showCardGrid;

  return (
    <div ref={containerRef}
      style={{ overflow: 'hidden', position: 'relative' }}
    >
      {/* ── 抽屉侧边栏 ── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: '50vw', zIndex: 20,
        transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
        background: 'var(--app-bg)',
        borderRight: '1px solid var(--app-border)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* 侧边栏头部 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 12px 8px', borderBottom: '1px solid var(--app-border)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-text)' }}>目录</span>
          <button onClick={() => setDrawerOpen(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--app-text-secondary)', padding: 4, fontSize: 16 }}>
            ✕
          </button>
        </div>
        {/* 侧边栏内容 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {VALID_DOMAINS.map((domain) => {
          const isDomainExpanded = expandedDomains.has(domain);
          const rootNodes = getDomainRoots(domain);
          return (
            <div key={domain}>
              {/* Domain 标题 */}
              <div
                onClick={() => setExpandedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(domain)) next.delete(domain); else next.add(domain);
                  return next;
                })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '8px 12px', fontSize: 12, fontWeight: 600,
                  color: 'var(--app-text-secondary)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  cursor: 'pointer', userSelect: 'none',
                }}
              >
                <CaretRight size={10} style={{
                  transform: isDomainExpanded ? 'rotate(90deg)' : 'none',
                  transition: 'transform 0.15s',
                }} />
                {domain}
                <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}>
                  {rootNodes.length}
                </span>
              </div>

              {/* Domain 下的根节点 */}
              {isDomainExpanded && rootNodes.map((node) => (
                <TreeNodeItem
                  key={node.id}
                  node={node}
                  allNodes={nodes}
                  depth={0}
                  selectedId={selectedId}
                  expandedIds={expandedIds}
                  onSelect={handleSelect}
                  onToggleExpand={(id) => setExpandedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id); else next.add(id);
                    return next;
                  })}
                />
              ))}

              {/* 添加根节点按钮 */}
              {isDomainExpanded && (
                <button
                  onClick={() => handleCreate(null, domain)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, width: '100%',
                    padding: '5px 12px 5px 26px', fontSize: 12,
                    color: 'var(--app-text-secondary)', background: 'none',
                    border: 'none', cursor: 'pointer', opacity: 0.6,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
                >
                  <Plus size={12} /> 添加
                </button>
              )}
            </div>
          );
        })}
        </div>{/* /侧边栏内容 */}
      </div>{/* /抽屉侧边栏 */}

      {/* ── 侧边栏打开时的遮罩 ── */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 19, background: 'transparent' }}
        />
      )}

      {/* ── 右侧内容区（菜单按钮 + 内容，侧边栏打开时右移）── */}
      <div style={{
        height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column',
        transition: 'margin-left 0.25s ease',
        marginLeft: drawerOpen ? '50vw' : 0,
      }}>
        {/* 菜单按钮 + 内容 */}
        <div style={{ padding: '12px 16px 0', flex: 1 }}>
          {/* 菜单按钮行 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, minHeight: 28 }}>
            {!drawerOpen && (
              <button
                onClick={() => setDrawerOpen(true)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  width: 28, height: 28, borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--app-text-secondary)', fontSize: 18, lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                ☰
              </button>
            )}
          </div>
        {!selectedId ? (
          /* 未选中任何节点：显示所有 domain 的根节点卡片 */
          <div>
            {VALID_DOMAINS.map((domain) => {
              const rootNodes = getDomainRoots(domain);
              if (rootNodes.length === 0) return null;
              return (
                <div key={domain} style={{ marginBottom: 24 }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--app-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{domain}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                    {rootNodes.map((node) => (
                      <NodeCard key={node.id} node={node} childCount={getChildren(node.id).length} onClick={() => handleSelect(node)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {/* 面包屑 */}
            <BreadcrumbCrumbs path={breadcrumb} onNavigate={handleBreadcrumbNav} />

            {/* 子节点卡片网格 */}
            {showCardGrid && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                {children.map((child) => (
                  <NodeCard key={child.id} node={child} childCount={getChildren(child.id).length} onClick={() => handleSelect(child)} />
                ))}
                {/* 添加子节点卡片 */}
                <button
                  onClick={() => handleCreate(selectedId, selectedNode?.domain ?? DEFAULT_DOMAIN)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 8, padding: 24, borderRadius: 12,
                    border: '2px dashed var(--app-border)', cursor: 'pointer',
                    background: 'transparent', color: 'var(--app-text-secondary)',
                    fontSize: 13, minHeight: 120,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--app-primary)'; e.currentTarget.style.color = 'var(--app-primary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--app-border)'; e.currentTarget.style.color = 'var(--app-text-secondary)'; }}
                >
                  <Plus size={24} />
                  新建记忆
                </button>
              </div>
            )}

            {/* 节点编辑/详情 */}
            {showEditor && selectedNode && (
              <DetailEditor
                node={selectedNode}
                editing={editing}
                editTitle={editTitle}
                editContent={editContent}
                editDisclosure={editDisclosure}
                editPriority={editPriority}
                onEditTitle={setEditTitle}
                onEditContent={setEditContent}
                onEditDisclosure={setEditDisclosure}
                onEditPriority={setEditPriority}
                onStartEdit={() => setEditing(true)}
                onSave={handleSave}
                onCancel={() => setEditing(false)}
                onDelete={handleDelete}
                onAddChild={() => handleCreate(selectedId, selectedNode.domain)}
              />
            )}
          </>
        )}
      </div>
    </div>
    </div>
  );
}

/* ── 子组件 ── */

function TreeNodeItem({
  node, allNodes, depth, selectedId, expandedIds, onSelect, onToggleExpand,
}: {
  node: GalleryNode; allNodes: GalleryNode[]; depth: number;
  selectedId: string | null; expandedIds: Set<string>;
  onSelect: (node: GalleryNode) => void; onToggleExpand: (id: string) => void;
}) {
  const isActive = selectedId === node.id;
  const isExpanded = expandedIds.has(node.id);
  const children = allNodes.filter((n) => n.parentId === node.id);

  return (
    <div>
      <div
        onClick={() => onSelect(node)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 8px', paddingLeft: depth * 14 + 10,
          borderRadius: 6, cursor: 'pointer', fontSize: 13,
          background: isActive ? 'var(--app-secondary)' : 'transparent',
          color: isActive ? 'var(--app-primary)' : 'var(--app-text)',
          fontWeight: isActive ? 500 : 400, userSelect: 'none',
          margin: '0 4px', transition: 'background 0.1s',
        }}
      >
        <span style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {children.length > 0 ? (
            <CaretRight size={12}
              style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
            />
          ) : (
            <FileText size={12} style={{ opacity: 0.5 }} />
          )}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {node.title || node.path}
        </span>
      </div>
      {isExpanded && children.map((child) => (
        <TreeNodeItem key={child.id} node={child} allNodes={allNodes} depth={depth + 1}
          selectedId={selectedId} expandedIds={expandedIds}
          onSelect={onSelect} onToggleExpand={onToggleExpand} />
      ))}
    </div>
  );
}

function BreadcrumbCrumbs({ path, onNavigate }: {
  path: { id: string | null; label: string }[];
  onNavigate: (id: string | null) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexShrink: 0, overflowX: 'auto' }}>
      <button onClick={() => onNavigate(null)}
        style={{ padding: 6, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--app-text-secondary)', display: 'flex' }}>
        <House size={14} />
      </button>
      {path.map((crumb, i) => (
        <div key={crumb.id ?? 'root'} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CaretRight size={12} style={{ color: 'var(--app-text-secondary)', opacity: 0.4, flexShrink: 0 }} />
          <button onClick={() => onNavigate(crumb.id)}
            style={{
              padding: '3px 8px', borderRadius: 6,
              border: i === path.length - 1 ? '1px solid var(--app-primary)' : 'none',
              cursor: 'pointer', fontSize: 12, fontWeight: i === path.length - 1 ? 600 : 400,
              whiteSpace: 'nowrap',
              background: i === path.length - 1 ? 'rgba(99,102,241,0.08)' : 'transparent',
              color: i === path.length - 1 ? 'var(--app-primary)' : 'var(--app-text-secondary)',
            }}>
            {crumb.label}
          </button>
        </div>
      ))}
    </div>
  );
}

function NodeCard({ node, childCount, onClick }: {
  node: GalleryNode; childCount: number; onClick: () => void;
}) {
  const hasChildren = childCount > 0;
  const snippet = node.content ? node.content.slice(0, 80) + (node.content.length > 80 ? '…' : '') : '';
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        padding: 16, borderRadius: 12, border: '1px solid var(--app-border)',
        background: 'var(--app-bg-card)', cursor: 'pointer', width: '100%',
        textAlign: 'left', position: 'relative', overflow: 'hidden',
        transition: 'all 0.25s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--app-primary)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(99,102,241,0.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--app-border)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, width: '100%' }}>
        <div style={{ padding: 6, borderRadius: 8, background: 'var(--app-secondary)', color: 'var(--app-primary)', display: 'flex', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {hasChildren ? <Folder size={16} weight="fill" /> : <FileText size={16} />}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--app-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.title || node.path.split('/').pop() || '未命名'}
          </div>
          <span style={{ fontSize: 10, color: 'var(--app-text-secondary)', fontFamily: 'monospace' }}>P{node.priority}</span>
        </div>
      </div>
      {node.disclosure && (
        <div style={{ marginBottom: 6, width: '100%' }}>
          <span style={{ fontSize: 11, color: '#d97706', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
            <span style={{ fontStyle: 'italic', lineHeight: 1.3 }}>{node.disclosure}</span>
          </span>
        </div>
      )}
      <div style={{ width: '100%', flex: 1 }}>
        {snippet ? (
          <p style={{ fontSize: 12, color: 'var(--app-text-secondary)', lineHeight: 1.5, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{snippet}</p>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--app-text-secondary)', fontStyle: 'italic', margin: 0, opacity: 0.4 }}>无内容</p>
        )}
      </div>
    </button>
  );
}

function DetailEditor({ node, editing, editTitle, editContent, editDisclosure, editPriority, onEditTitle, onEditContent, onEditDisclosure, onEditPriority, onStartEdit, onSave, onCancel, onDelete, onAddChild }: {
  node: GalleryNode; editing: boolean; editTitle: string; editContent: string; editDisclosure: string; editPriority: number;
  onEditTitle: (v: string) => void; onEditContent: (v: string) => void; onEditDisclosure: (v: string) => void; onEditPriority: (v: number) => void;
  onStartEdit: () => void; onSave: () => void; onCancel: () => void; onDelete: () => void; onAddChild: () => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {editing ? (
          <input autoFocus value={editTitle} onChange={(e) => onEditTitle(e.target.value)}
            placeholder="标题"
            style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--app-border)', fontSize: 15, fontWeight: 600, background: 'var(--app-bg-card)', color: 'var(--app-text)' }} />
        ) : (
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--app-text)', flex: 1 }}>{node.title || node.path}</h3>
        )}
        <button onClick={editing ? onSave : onStartEdit}
          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--app-border)', cursor: 'pointer', background: editing ? 'var(--app-primary)' : 'var(--app-bg-card)', color: editing ? '#fff' : 'var(--app-text)', fontSize: 12, fontWeight: 500 }}>
          {editing ? '保存' : '编辑'}
        </button>
        {!editing && (
          <>
            <button onClick={onAddChild} style={iconBtnStyle} title="添加子记忆"><Plus size={16} /></button>
            <button onClick={onDelete} style={{ ...iconBtnStyle, color: '#ef4444' }} title="删除"><TrashIcon size={16} /></button>
          </>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--app-text-secondary)', marginBottom: 12, fontFamily: 'monospace' }}>
        {node.domain}://{node.path}
      </div>

      {editing ? (
        <div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>触发条件 (disclosure)</label>
            <input value={editDisclosure} onChange={(e) => onEditDisclosure(e.target.value)}
              placeholder="例如：When user mentions..."
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--app-border)', fontSize: 13, marginTop: 4, boxSizing: 'border-box', background: 'var(--app-bg-card)', color: 'var(--app-text)' }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>优先级 (0=最高)</label>
            <input type="number" min={0} max={10} value={editPriority} onChange={(e) => onEditPriority(Number(e.target.value))}
              style={{ width: 72, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--app-border)', fontSize: 13, marginTop: 4, background: 'var(--app-bg-card)', color: 'var(--app-text)' }} />
          </div>
          <textarea value={editContent} onChange={(e) => onEditContent(e.target.value)}
            placeholder="记忆内容..."
            style={{ width: '100%', minHeight: 200, padding: 10, borderRadius: 8, border: '1px solid var(--app-border)', fontSize: 13, lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', background: 'var(--app-bg-card)', color: 'var(--app-text)' }} />
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button className="theme-btn" onClick={onSave}>保存</button>
            <button className="theme-btn theme-btn--cancel" onClick={onCancel}>取消</button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--app-text)' }}>
          {node.content || <span style={{ color: 'var(--app-text-secondary)', opacity: 0.5 }}>（空）</span>}
        </div>
      )}
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '4px 8px', borderRadius: 6, fontSize: 12,
  color: 'var(--app-text)', display: 'flex', alignItems: 'center', gap: 4,
};
