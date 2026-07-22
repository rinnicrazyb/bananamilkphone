/**
 * ChainOfThought — 工具调用链
 *
 * Tidal Echo + RikkaHub 融合：
 * - 无气泡背景，与思考链视觉一致（灰蓝色调，不喧宾夺主）
 * - 紧凑行：glyph + 标签 + 摘要 + → 箭头
 * - 点击弹出 ToolDrawer 底部窗口（代替 inline 展开，解决卡顿）
 * - 位置逻辑保持 RikkaHub（在消息流中与思考链同级）
 */
import { useState } from 'react';
import ToolDrawer from './ToolDrawer';

interface ChainOfThoughtProps {
  steps: Array<{
    toolCallId: string;
    toolName: string;
    input: string;
    output?: string;
    isExecuted: boolean;
  }>;
  toolResults?: Record<string, string>;
  autoCollapse?: boolean;
}

type ToolCategory = 'search' | 'mcp' | 'local' | 'app';

function categorizeTool(toolName: string): ToolCategory {
  if (toolName === 'search_web' || toolName === 'scrape_web') return 'search';
  if (toolName.startsWith('mcp__')) return 'mcp';
  if (['get_time_info', 'get_time', 'get_date', 'get_screen_time'].includes(toolName)) return 'local';
  return 'app';
}

const GLYPHS: Record<ToolCategory, string> = {
  search: '✱',
  mcp: '∞',
  local: '◇',
  app: '✦',
};

function getToolGlyph(toolName: string): string {
  return GLYPHS[categorizeTool(toolName)];
}

function getToolLabel(toolName: string): string {
  const cat = categorizeTool(toolName);
  if (toolName === 'search_web') return '搜索';
  if (toolName === 'scrape_web') return '抓取网页';
  if (toolName === 'get_time_info' || toolName === 'get_time') return '获取时间';
  if (toolName === 'get_date') return '获取日期';
  if (toolName === 'get_screen_time') return '屏幕使用时间';
  if (cat === 'mcp') {
    const parts = toolName.split('__');
    return parts.length >= 3 ? `${parts[1]}: ${parts.slice(2).join('.')}` : toolName;
  }
  return toolName;
}

function summarizeOutput(output: string, _toolName: string): string {
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) return `找到 ${parsed.length} 条结果`;
    if (parsed.answer) return (parsed.answer as string).slice(0, 60);
    if (parsed.items || parsed.results) {
      const items = parsed.items || parsed.results || [];
      if (parsed.answer) {
        return (parsed.answer as string).slice(0, 60);
      }
      return `找到 ${items.length} 条结果`;
    }
    if (parsed.url && parsed.content) return '已获取页面内容';
    if (parsed.status === 'success' || parsed.success) return '执行成功';
    if (parsed.error) return `错误`;
    const keys = Object.keys(parsed);
    if (keys.length <= 3) return JSON.stringify(parsed).slice(0, 60);
    return `${keys.length} 个字段`;
  } catch {
    return output.slice(0, 60);
  }
}

export default function ChainOfThought({ steps, toolResults, autoCollapse }: ChainOfThoughtProps) {
  const [expanded, setExpanded] = useState(!autoCollapse);
  const [drawerStep, setDrawerStep] = useState<typeof steps[0] | null>(null);

  if (steps.length === 0) return null;

  const COLLAPSED_VISIBLE = 2;
  const visibleSteps = expanded ? steps : steps.slice(0, COLLAPSED_VISIBLE);
  const hiddenCount = steps.length - COLLAPSED_VISIBLE;

  const openDrawer = (step: typeof steps[0]) => {
    setDrawerStep(step);
  };

  return (
    <div style={{ margin: '4px 0' }}>
      <div style={{ fontSize: 13 }}>
        {visibleSteps.map((step) => {
          const effectiveOutput = step.output || (toolResults?.[step.toolCallId]);
          const isActuallyExecuted = step.isExecuted || !!effectiveOutput;
          const isProcessing = !isActuallyExecuted;
          const summary = effectiveOutput ? summarizeOutput(effectiveOutput, step.toolName) : null;

          return (
            <div
              key={step.toolCallId}
              onClick={() => openDrawer(step)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', cursor: 'pointer', userSelect: 'none',
                borderBottom: '1px solid var(--app-border)',
                color: 'var(--app-text-secondary)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--app-secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Glyph */}
              <span style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13,
                color: isProcessing ? 'var(--app-primary)' : 'var(--app-text-secondary)',
              }}>
                {isProcessing ? (
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: 'var(--app-primary)',
                    animation: 'cot-pulse 1s ease-in-out infinite',
                  }} />
                ) : (
                  getToolGlyph(step.toolName)
                )}
              </span>

              {/* 标签 */}
              <span style={{ flex: 1, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {getToolLabel(step.toolName)}
              </span>

              {/* 摘要 */}
              {summary && (
                <span style={{
                  fontSize: 11, color: 'var(--app-text-secondary)',
                  maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  opacity: 0.7,
                }}>
                  {summary}
                </span>
              )}

              {/* → 箭头 */}
              <span style={{ fontSize: 11, color: 'var(--app-border)', flexShrink: 0 }}>
                →
              </span>
            </div>
          );
        })}

        {steps.length > COLLAPSED_VISIBLE && (
          <div
            onClick={() => setExpanded(!expanded)}
            style={{
              padding: '8px 12px', cursor: 'pointer', fontSize: 12,
              color: 'var(--app-text-secondary)', textAlign: 'center',
              letterSpacing: '0.05em',
              borderBottom: '1px solid var(--app-border)',
            }}
          >
            {expanded ? '收起' : `显示 ${hiddenCount} 个更多步骤`}
          </div>
        )}
      </div>

      <style>{`
        @keyframes cot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>

      {/* ToolDrawer 底部窗口 */}
      {drawerStep && (
        <ToolDrawer
          open={!!drawerStep}
          onClose={() => setDrawerStep(null)}
          title={getToolLabel(drawerStep.toolName)}
          toolName={drawerStep.toolName}
          input={drawerStep.input}
          output={drawerStep.output || (toolResults?.[drawerStep.toolCallId] || '')}
          isExecuted={drawerStep.isExecuted || !!toolResults?.[drawerStep.toolCallId]}
          isProcessing={!drawerStep.isExecuted && !toolResults?.[drawerStep.toolCallId]}
        />
      )}
    </div>
  );
}
