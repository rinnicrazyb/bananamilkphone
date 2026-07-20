/**
 * ToolDrawer — 底部滑动窗口
 *
 * 使用 vaul Drawer 实现，从底部滑入显示工具调用详情
 * 搜索/抓取工具走专用渲染视图，其他工具走代码块
 */
import { Drawer } from 'vaul';
import SearchResultsView from './SearchResultsView';
import ScrapeResultView from './ScrapeResultView';

interface ToolDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  toolName: string;
  input: string;
  output: string;
  isExecuted: boolean;
  isProcessing: boolean;
}

function getToolGlyph(toolName: string): string {
  if (toolName === 'search_web' || toolName === 'scrape_web') return '✱';
  if (toolName.startsWith('mcp__')) return '∞';
  if (['get_time_info', 'get_time', 'get_date', 'get_screen_time'].includes(toolName)) return '◇';
  return '✦';
}

export default function ToolDrawer({ open, onClose, title, toolName, input, output, isExecuted, isProcessing }: ToolDrawerProps) {
  const glyph = getToolGlyph(toolName);

  return (
    <Drawer.Root open={open} onClose={onClose}>
      <Drawer.Portal>
        <Drawer.Overlay
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.4)',
          }}
        />
        <Drawer.Content
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1001,
            maxHeight: '80vh', borderRadius: '16px 16px 0 0',
            background: 'var(--app-bg)',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* 拖拽手柄 */}
          <div style={{
            width: 36, height: 4, borderRadius: 2,
            background: 'var(--app-border)',
            margin: '10px auto 4px', flexShrink: 0,
          }} />

          {/* 标题 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px 12px', flexShrink: 0,
            borderBottom: '1px solid var(--app-border)',
          }}>
            <span style={{ fontSize: 16 }}>{glyph}</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--app-text)' }}>
              {title}
            </span>
            {isProcessing && (
              <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', marginLeft: 'auto' }}>
                执行中…
              </span>
            )}
          </div>

          {/* 内容区域 */}
          <div style={{
            padding: '4px 16px 16px', overflow: 'auto', flex: 1, fontSize: 12,
          }}>
            {/* 搜索专用视图 */}
            {toolName === 'search_web' && output && (
              <SearchResultsView query={extractSearchQuery(input)} rawOutput={output} />
            )}

            {/* 抓取专用视图 */}
            {toolName === 'scrape_web' && output && (
              <ScrapeResultView rawOutput={output} />
            )}

            {/* 其他工具 → 默认代码块视图 */}
            {toolName !== 'search_web' && toolName !== 'scrape_web' && (
              <>
                {/* 入参 */}
                {input && input !== '{}' && (
                  <Section label="参数">
                    <CodeBlock code={input} />
                  </Section>
                )}

                {/* 结果 */}
                {output && (
                  <Section label="结果">
                    <CodeBlock code={output} />
                  </Section>
                )}
              </>
            )}

            {!isExecuted && !isProcessing && (
              <div style={{ color: 'var(--app-text-secondary)', textAlign: 'center', padding: 16 }}>
                等待执行…
              </div>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** 从工具入参 JSON 中提取搜索关键词 */
function extractSearchQuery(input: string): string {
  try {
    const parsed = JSON.parse(input);
    return parsed.query || '';
  } catch {
    return input.slice(0, 60);
  }
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 11, color: 'var(--app-text-secondary)', marginBottom: 4,
        letterSpacing: '0.05em',
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre style={{
      background: 'var(--app-secondary)', borderRadius: 8, padding: 10,
      fontSize: 11, lineHeight: 1.5, overflow: 'auto', maxHeight: 200,
      whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      color: 'var(--app-text)', margin: 0,
    }}>
      {code}
    </pre>
  );
}
