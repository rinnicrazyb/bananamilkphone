/**
 * 条目编辑弹窗
 *
 * 设计：底部弹窗（Modal Bottom Sheet）
 * 字段完整覆盖：
 * - 名称、启用、优先级、注入位置、角色、注入内容
 * - 常驻激活、关键词（Chip 输入）、正则、大小写敏感、扫描深度、AT_DEPTH 深度
 */
import { useState } from 'react';
import { X } from '@phosphor-icons/react';
import { InjectionPosition } from '../types';
import type { LorebookEntry } from '../types';

interface Props {
  entry: LorebookEntry;
  onSave: (entry: Partial<LorebookEntry>) => void;
  onClose: () => void;
}

const POSITION_OPTIONS: { value: string; label: string }[] = [
  { value: InjectionPosition.BEFORE_SYSTEM_PROMPT, label: '系统提示词前' },
  { value: InjectionPosition.AFTER_SYSTEM_PROMPT, label: '系统提示词后' },
  { value: InjectionPosition.TOP_OF_CHAT, label: '对话开头' },
  { value: InjectionPosition.BOTTOM_OF_CHAT, label: '最新消息前' },
  { value: InjectionPosition.AT_DEPTH, label: '指定深度' },
];

const ROLE_OPTIONS: { value: 'user' | 'assistant'; label: string }[] = [
  { value: 'user', label: '用户 (User)' },
  { value: 'assistant', label: 'AI (Assistant)' },
];

export default function EntryEditorDialog({ entry, onSave, onClose }: Props) {
  const [form, setForm] = useState({ ...entry });
  const [keywordInput, setKeywordInput] = useState('');

  const isInsertPosition =
    form.position === InjectionPosition.TOP_OF_CHAT ||
    form.position === InjectionPosition.BOTTOM_OF_CHAT ||
    form.position === InjectionPosition.AT_DEPTH;

  const handleAddKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !form.keywords.includes(kw)) {
      setForm({ ...form, keywords: [...form.keywords, kw] });
    }
    setKeywordInput('');
  };

  const handleRemoveKeyword = (kw: string) => {
    setForm({ ...form, keywords: form.keywords.filter((k) => k !== kw) });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  const isEditing = !!entry.name || entry.content !== '';

  return (
    <div className="entry-editor-overlay" onClick={onClose}>
      <div className="entry-editor" onClick={(e) => e.stopPropagation()}>
        <div className="entry-editor__header">
          <h3>{isEditing ? '编辑条目' : '新建条目'}</h3>
          <button className="theme-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="entry-editor__body">
          {/* 名称 */}
          <label className="entry-editor__field">
            <span>名称</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="条目标识名称"
            />
          </label>

          {/* 启用 */}
          <label className="entry-editor__field entry-editor__field--switch">
            <span>启用</span>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
          </label>

          {/* 优先级 */}
          <label className="entry-editor__field">
            <span>优先级（1-100）</span>
            <input
              type="number"
              min={1}
              max={100}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })}
            />
          </label>

          {/* 注入位置 */}
          <label className="entry-editor__field">
            <span>注入位置</span>
            <select
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value as any })}
            >
              {POSITION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {/* 角色（仅插入位置时显示） */}
          {isInsertPosition && (
            <label className="entry-editor__field">
              <span>注入角色</span>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as 'user' | 'assistant' })}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* AT_DEPTH 深度 */}
          {form.position === InjectionPosition.AT_DEPTH && (
            <label className="entry-editor__field">
              <span>插入深度（从最新消息往前数）</span>
              <input
                type="number"
                min={1}
                value={form.injectDepth}
                onChange={(e) => setForm({ ...form, injectDepth: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
          )}

          {/* 注入内容 */}
          <label className="entry-editor__field">
            <span>注入内容（发送给 LLM 的提示词）</span>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={6}
              placeholder="输入世界书设定内容……"
            />
          </label>

          {/* 常驻激活 */}
          <label className="entry-editor__field entry-editor__field--switch">
            <span>常驻激活（始终注入，无需关键词匹配）</span>
            <input
              type="checkbox"
              checked={form.constantActive}
              onChange={(e) => setForm({ ...form, constantActive: e.target.checked })}
            />
          </label>

          {/* 关键词（仅非常驻时显示） */}
          {!form.constantActive && (
            <>
              <label className="entry-editor__field">
                <span>触发关键词</span>
                <div className="entry-editor__keywords-input">
                  <input
                    type="text"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入关键词后按回车"
                  />
                  <button className="theme-btn" onClick={handleAddKeyword}>
                    添加
                  </button>
                </div>
                {form.keywords.length > 0 && (
                  <div className="entry-editor__keywords">
                    {form.keywords.map((kw) => (
                      <span key={kw} className="entry-editor__keyword-chip">
                        {kw}
                        <button onClick={() => handleRemoveKeyword(kw)}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </label>

              {/* 扫描深度 */}
              <label className="entry-editor__field">
                <span>扫描深度（最近 N 条消息）</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={form.scanDepth}
                  onChange={(e) => setForm({ ...form, scanDepth: Math.max(1, Number(e.target.value) || 1) })}
                />
              </label>

              {/* 正则匹配 */}
              <label className="entry-editor__field entry-editor__field--switch">
                <span>使用正则表达式匹配</span>
                <input
                  type="checkbox"
                  checked={form.useRegex}
                  onChange={(e) => setForm({ ...form, useRegex: e.target.checked })}
                />
              </label>

              {/* 大小写敏感 */}
              <label className="entry-editor__field entry-editor__field--switch">
                <span>大小写敏感</span>
                <input
                  type="checkbox"
                  checked={form.caseSensitive}
                  onChange={(e) => setForm({ ...form, caseSensitive: e.target.checked })}
                />
              </label>
            </>
          )}
        </div>

        <div className="entry-editor__footer">
          <button className="theme-btn" onClick={onClose}>
            取消
          </button>
          <button
            className="theme-btn theme-btn--primary"
            onClick={() => onSave(form)}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
