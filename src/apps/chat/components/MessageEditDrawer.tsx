/**
 * MessageEditDrawer — 底部滑出窗口：查看/编辑消息原始 Markdown
 */
import { useState, useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  /** 消息原始内容（Markdown 文本） */
  content: string;
  /** 是否可编辑（false = 只读/复制模式） */
  editable?: boolean;
  onSave?: (newContent: string) => void;
  /** 编辑后重新发送（触发 LLM 生成） */
  onResend?: (newContent: string) => void;
  onClose: () => void;
}

export default function MessageEditDrawer({ open, content, editable, onSave, onResend, onClose }: Props) {
  const [text, setText] = useState(content);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setText(content); }, [content, open]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      if (editable) inputRef.current.setSelectionRange(text.length, text.length);
    }
  }, [open, editable, text.length]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch { /* ignore */ }
  };

  if (!open) return null;

  return (
    <>
      <div className="msg-edit-overlay" onClick={onClose} />
      <div className="msg-edit-drawer">
        <div className="msg-edit-drawer__handle">
          <div className="msg-edit-drawer__bar" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-text)' }}>
              {editable ? '编辑消息' : '消息原文'}
            </span>
            {!editable && (
              <button onClick={handleCopy} style={{
                background: 'var(--app-primary)', color: '#fff', border: 'none',
                borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
              }}>
                复制
              </button>
            )}
          </div>
        </div>
        <textarea
          ref={inputRef}
          className="msg-edit-drawer__textarea"
          value={text}
          onChange={(e) => editable && setText(e.target.value)}
          readOnly={!editable}
        />
        {editable && (
          <div className="msg-edit-drawer__actions">
            <button onClick={onClose} className="msg-edit-drawer__btn msg-edit-drawer__btn--cancel">取消</button>
            <button onClick={() => { onSave?.(text); onClose(); }} className="msg-edit-drawer__btn msg-edit-drawer__btn--confirm">确认</button>
            {onResend && (
              <button onClick={() => { onResend(text); onClose(); }} className="msg-edit-drawer__btn msg-edit-drawer__btn--resend" style={{
                background: 'var(--app-primary)', color: '#fff', border: 'none',
                borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                marginLeft: 8,
              }}>重新发送</button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
