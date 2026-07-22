/**
 * ReasoningBlock — 思考链折叠卡片
 *
 * Tidal Echo 风格：折叠态显示 "✦ thinking ✧" 居中标签
 * 展开后为主体居中的安静阅读区，与正文气泡视觉区分
 */
import { useState, useEffect, useRef } from 'react';

interface ReasoningBlockProps {
  content: string;
  /** 是否正在生成中（finishedAt 为空） */
  isLoading?: boolean;
  /** 是否自动折叠（生成完成后） */
  autoCollapse?: boolean;
}

export default function ReasoningBlock({ content, isLoading, autoCollapse }: ReasoningBlockProps) {
  // 流式过程中强制展开，结束后按 autoCollapse 决定是否折叠
  const [open, setOpen] = useState(!autoCollapse || !!isLoading);
  const prevLoadingRef = useRef(isLoading);

  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      // isLoading 从 true→false：流式结束，按 autoCollapse 折叠
      if (autoCollapse) setOpen(false);
    } else if (!prevLoadingRef.current && isLoading) {
      // isLoading 从 false→true：开始流式，强制展开
      setOpen(true);
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, autoCollapse]);

  if (!content) return null;

  return (
    <div style={{
      margin: open ? '10px 0' : '4px 0',
      textAlign: 'center',
      opacity: isLoading ? 0.8 : 1,
    }}>
      {/* 渐变分隔线（仅展开时显示） */}
      {open && (
        <div style={{
          height: 1,
          background: 'linear-gradient(to right, transparent, var(--app-border), transparent)',
          marginBottom: 12,
        }} />
      )}

      {/* 标签按钮 */}
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          cursor: 'pointer',
          userSelect: 'none',
          letterSpacing: '0.08em',
          fontSize: 13,
          color: 'var(--app-text-secondary)',
          padding: open ? '0 0 12px 0' : '4px 16px',
        }}
      >
        {open ? '✦' : '✧'}
        <span style={{ fontWeight: 400 }}>thinking</span>
        {open ? '✦' : '✧'}
      </div>

      {/* 展开内容区 — 居中阅读 */}
      {open && (
        <>
          <div style={{
            maxWidth: '82%',
            margin: '0 auto',
            fontSize: 12.5,
            color: 'var(--app-text-secondary)',
            lineHeight: 1.72,
            textAlign: 'center',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
            maxHeight: 240,
            overflow: 'auto',
            padding: '0 4px',
          }}>
            {content}
          </div>

          {/* 底部星形装饰 */}
          <div style={{
            marginTop: 14,
            display: 'flex',
            justifyContent: 'center',
            gap: 6,
            color: 'var(--app-border)',
            fontSize: 11,
            letterSpacing: '0.3em',
          }}>
            <span>✦</span>
          </div>

          {/* 底部渐变分隔线 */}
          <div style={{
            height: 1,
            background: 'linear-gradient(to right, transparent, var(--app-border), transparent)',
            marginTop: 14,
          }} />
        </>
      )}
    </div>
  );
}
