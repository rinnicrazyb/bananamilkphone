import { useState, useMemo } from 'react';
import {
  CaretLeft, DownloadSimple, PencilSimple, Trash, CaretDown, CaretRight,
  Clock, KeyReturn, Play
} from '@phosphor-icons/react';
import { useChatStore } from '../store/chat-store';
import { extractMemories } from '../../../services/memory-extraction/index';
import { DEFAULT_EXTRACTION_PROMPT } from '../../../services/memory-extraction/prompt';
import type { Memory } from '../types';

interface MemoryPageProps {
  onBack: () => void;
}

export default function MemoryPage({ onBack }: MemoryPageProps) {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const agents = useChatStore((s) => s.agents);
  const allMemories = useChatStore((s) => s.memories);
  const rawMessages = useChatStore((s) =>
    activeConversationId ? s.getCurrentMessages(activeConversationId) : []
  );
  const updateMemory = useChatStore((s) => s.updateMemory);
  const deleteMemory = useChatStore((s) => s.deleteMemory);
  const updateAgentDisplayConfig = useChatStore((s) => s.updateAgentDisplayConfig);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const agent = agents.find((a) => a.id === activeConv?.agentId);
  const agentId = agent?.id;
  const memories = agentId ? (allMemories[agentId] ?? []) : [];
  const displayConfig = agent?.displayConfig;

  // ── 状态 ──
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [extractSelectedIds, setExtractSelectedIds] = useState<Set<string>>(new Set());
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractResult, setExtractResult] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // 展开状态
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});

  // ── 提取弹窗 ──
  const sortedMessages = useMemo(
    () => [...(rawMessages ?? [])].sort((a, b) => a.timestamp - b.timestamp),
    [rawMessages]
  );

  const unextractedMessages = sortedMessages.filter((m) => !m.memoryExtracted);
  const extractedCount = sortedMessages.length - unextractedMessages.length;

  const toggleSelectAll = () => {
    if (extractSelectedIds.size === unextractedMessages.length) {
      setExtractSelectedIds(new Set());
    } else {
      setExtractSelectedIds(new Set(unextractedMessages.map((m) => m.id)));
    }
  };

  const handleExtract = async () => {
    if (!agent || !activeConversationId) return;
    const selected = sortedMessages.filter((m) => extractSelectedIds.has(m.id));
    if (selected.length === 0) return;

    setExtracting(true);
    setExtractError(null);
    setExtractResult(null);

    const result = await extractMemories({
      messages: selected,
      agentName: agent.name,
      agentId: agent.id,
      conversationId: activeConversationId,
      customPrompt: displayConfig?.extractionPrompt,
    });

    setExtracting(false);

    if (!result.success) {
      setExtractError(result.error || '提取失败');
    } else {
      setExtractResult(`成功提取 ${result.count} 条记忆`);
      setExtractSelectedIds(new Set());
      setTimeout(() => {
        setShowExtractModal(false);
        setExtractResult(null);
      }, 1500);
    }
  };

  // ── 编辑 ──
  const handleStartEdit = (mem: Memory) => {
    setEditingId(mem.id);
    setEditContent(mem.content);
  };

  const handleConfirmEdit = () => {
    if (editingId && editContent.trim()) {
      updateMemory(agent!.id, editingId, editContent.trim());
    }
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (confirm('确定删除这条记忆？')) {
      deleteMemory(agent!.id, id);
    }
  };

  const toggleCollapse = (id: string) => {
    setCollapsedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!agent) {
    return (
      <div className="func-fullpage">
        <div className="func-fullpage__header">
          <button className="back-btn" onClick={onBack}><CaretLeft size={18} /> 返回</button>
          <h1>长期记忆</h1>
        </div>
        <div className="func-fullpage__body" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 8 }}>
          <p style={{ color: 'var(--app-text-secondary)' }}>无法加载记忆页面</p>
          <p style={{ fontSize: 12, color: '#ff4444' }}>
            {!activeConversationId ? '诊断: activeConversationId 为空' :
             !activeConv ? '诊断: 未找到对应对话' :
             '诊断: 未找到对应智能体'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="func-fullpage">
      <div className="func-fullpage__header">
        <button className="back-btn" onClick={onBack}><CaretLeft size={18} /> 返回</button>
        <h1>长期记忆</h1>
      </div>
      <div className="func-fullpage__body">
        {/* ── 提取操作 ── */}
        <div className="settings-card" style={{ marginBottom: 12 }}>
          <button className="theme-btn" style={{ width: '100%', padding: '10px 0', fontSize: 14 }}
            onClick={() => setShowExtractModal(true)}>
            <DownloadSimple size={18} /> 从对话中提取记忆
          </button>
          <p className="settings-field__hint" style={{ textAlign: 'center', marginTop: 4 }}>
            已提取 {extractedCount} 条 · 未提取 {unextractedMessages.length} 条 · 共 {memories.length} 条记忆
          </p>
        </div>

        {/* ── 自动提取设置 ── */}
        <details className="context-block" open>
          <summary className="context-block__header">
            <span className="context-block__tag context-block__tag--memory">自动提取</span>
          </summary>
          <div style={{ padding: '8px 12px' }}>
            {/* 关键词触发 */}
            <label className="settings-field settings-field--row" style={{ marginBottom: 8 }}>
              <KeyReturn size={16} />
              <span>关键词触发</span>
              <input type="checkbox" checked={displayConfig?.extractionKeywordEnabled ?? false}
                onChange={(e) => updateAgentDisplayConfig(agent.id, { extractionKeywordEnabled: e.target.checked })} />
            </label>
            <div style={{ paddingLeft: 28, marginBottom: 12 }}>
              <input className="settings-input" placeholder="用逗号分隔关键词"
                value={(displayConfig?.extractionKeywords ?? []).join('，')}
                onChange={(e) => updateAgentDisplayConfig(agent.id, {
                  extractionKeywords: e.target.value.split(/[,，、\s]+/).filter(Boolean)
                })} />
              <p className="settings-field__hint">用户消息包含关键词时，AI回复后自动提取所有未提取条目</p>
            </div>

            {/* 定时触发 */}
            <label className="settings-field settings-field--row" style={{ marginBottom: 8 }}>
              <Clock size={16} />
              <span>定时提取</span>
              <input type="checkbox" checked={displayConfig?.extractionTimeEnabled ?? false}
                onChange={(e) => updateAgentDisplayConfig(agent.id, { extractionTimeEnabled: e.target.checked })} />
            </label>
            <div style={{ paddingLeft: 28, marginBottom: 12 }}>
              <input type="time" className="settings-input" style={{ width: 120 }}
                value={displayConfig?.extractionTime || '04:00'}
                onChange={(e) => updateAgentDisplayConfig(agent.id, { extractionTime: e.target.value })} />
              <p className="settings-field__hint">到达设定时间时自动提取（App 未运行时下次打开触发）</p>
            </div>

            {/* 打开触发 */}
            <label className="settings-field settings-field--row">
              <Play size={16} />
              <span>打开软件时触发</span>
              <input type="checkbox" checked={displayConfig?.extractionOpenTriggerEnabled ?? true}
                onChange={(e) => updateAgentDisplayConfig(agent.id, { extractionOpenTriggerEnabled: e.target.checked })} />
            </label>
            <p className="settings-field__hint" style={{ paddingLeft: 28 }}>每次打开香蕉牛奶机时自动检查并触发记忆提取</p>
          </div>
        </details>

        {/* ── 提取提示词 ── */}
        <details className="context-block">
          <summary className="context-block__header">
            <span className="context-block__tag context-block__tag--tool">提取提示词</span>
            <span style={{ fontSize: 11, color: 'var(--app-text-secondary)' }}>
              {displayConfig?.extractionPrompt ? '已自定义' : '使用默认'}
            </span>
          </summary>
          <div style={{ padding: '8px 12px' }}>
            <textarea className="settings-textarea" rows={8}
              placeholder={DEFAULT_EXTRACTION_PROMPT.slice(0, 100) + '...'}
              value={displayConfig?.extractionPrompt ?? ''}
              onChange={(e) => updateAgentDisplayConfig(agent.id, { extractionPrompt: e.target.value })} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button className="theme-btn" onClick={() => updateAgentDisplayConfig(agent.id, { extractionPrompt: '' })}>
                恢复默认提示词
              </button>
            </div>
          </div>
        </details>

        {/* ── 记忆列表 ── */}
        <details className="context-block" open>
          <summary className="context-block__header">
            <span className="context-block__tag context-block__tag--static">记忆列表</span>
            <span style={{ fontSize: 11, color: 'var(--app-text-secondary)' }}>{memories.length} 条</span>
          </summary>
          <div style={{ padding: '4px 0' }}>
            {memories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--app-text-secondary)', fontSize: 13 }}>
                暂无记忆
              </div>
            ) : (
              memories.map((mem, idx) => {
                const isCollapsed = collapsedMap[mem.id] ?? true;
                const shortContent = mem.content.length > 80
                  ? mem.content.slice(0, 80) + '...'
                  : mem.content;

                return (
                  <div key={mem.id} style={{
                    borderBottom: '1px solid var(--app-border)',
                    padding: '4px 12px',
                  }}>
                    {editingId === mem.id ? (
                      <div style={{ padding: '8px 0' }}>
                        <textarea className="settings-textarea" rows={4} value={editContent}
                          onChange={(e) => setEditContent(e.target.value)} />
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button className="theme-btn" onClick={handleConfirmEdit}>确认</button>
                          <button className="theme-btn" onClick={() => setEditingId(null)}>取消</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', cursor: 'pointer' }}
                          onClick={() => toggleCollapse(mem.id)}>
                          <span onClick={(e) => { e.stopPropagation(); toggleCollapse(mem.id); }}
                            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            {isCollapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
                          </span>
                          <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--app-primary)', minWidth: 24 }}>
                            #{idx + 1}
                          </span>
                          <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {shortContent}
                          </span>
                          <span style={{ display: 'flex', gap: 4 }}>
                            <button className="conv-item__btn" onClick={(e) => { e.stopPropagation(); handleStartEdit(mem); }}
                              title="修改"><PencilSimple size={14} /></button>
                            <button className="conv-item__btn conv-item__btn--danger"
                              onClick={(e) => { e.stopPropagation(); handleDelete(mem.id); }}
                              title="删除"><Trash size={14} /></button>
                          </span>
                        </div>
                        {!isCollapsed && (
                          <pre className="context-block__content" style={{ padding: '4px 0 8px 30px', fontSize: 12 }}>
                            {mem.content}
                            {mem.sourceMsgIds.length > 0 && (
                              <div style={{ fontSize: 11, color: 'var(--app-text-secondary)', marginTop: 4 }}>
                                来源：{mem.sourceMsgIds.length} 条消息
                              </div>
                            )}
                          </pre>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </details>
      </div>

      {/* ── 提取弹窗 ── */}
      {showExtractModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={() => setShowExtractModal(false)}>
          <div style={{
            background: 'var(--app-bg)', borderRadius: 12, maxWidth: 480, width: '100%',
            maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          }} onClick={(e) => e.stopPropagation()}>
            <div className="func-fullpage__header" style={{ borderBottom: '1px solid var(--app-border)' }}>
              <h1 style={{ fontSize: 15 }}>从对话中提取记忆</h1>
              <button className="back-btn" onClick={() => setShowExtractModal(false)}>关闭</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
              <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  <input type="checkbox" checked={extractSelectedIds.size === unextractedMessages.length && unextractedMessages.length > 0}
                    onChange={toggleSelectAll} /> 全选
                </label>
                <span style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                  {extractSelectedIds.size} / {unextractedMessages.length} 条可选
                </span>
              </div>

              {unextractedMessages.length === 0 ? (
                <p style={{ textAlign: 'center', padding: 24, color: 'var(--app-text-secondary)', fontSize: 13 }}>
                  所有消息已提取，暂无未提取的条目
                </p>
              ) : (
                unextractedMessages.map((msg) => (
                  <label key={msg.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0',
                    borderBottom: '1px solid var(--app-border)', cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={extractSelectedIds.has(msg.id)}
                      style={{ marginTop: 3 }}
                      onChange={() => {
                        setExtractSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(msg.id)) next.delete(msg.id);
                          else next.add(msg.id);
                          return next;
                        });
                      }} />
                    <div style={{ flex: 1, fontSize: 13, overflow: 'hidden' }}>
                      <span style={{ color: 'var(--app-text-secondary)', fontSize: 11 }}>
                        {msg.role === 'user' ? '用户' : agent.name} · {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}：
                      </span>
                      <span style={{ marginLeft: 4 }}>{msg.content}</span>
                    </div>
                  </label>
                ))
              )}

              {extractError && (
                <div style={{ color: '#ff4444', fontSize: 13, padding: '8px 0' }}>{extractError}</div>
              )}
              {extractResult && (
                <div style={{ color: '#22c55e', fontSize: 13, padding: '8px 0' }}>{extractResult}</div>
              )}
            </div>
            <div style={{ padding: 12, borderTop: '1px solid var(--app-border)', display: 'flex', gap: 8 }}>
              <button className="theme-btn" style={{ flex: 1, padding: '8px 0' }}
                onClick={() => setShowExtractModal(false)}>取消</button>
              <button className="theme-btn" style={{ flex: 1, padding: '8px 0' }}
                disabled={extractSelectedIds.size === 0 || extracting}
                onClick={handleExtract}>
                {extracting ? '提取中...' : `提取并总结（${extractSelectedIds.size}条）`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
