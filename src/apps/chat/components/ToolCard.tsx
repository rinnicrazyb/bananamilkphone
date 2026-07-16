import { useState } from 'react';
import { CaretDown, CaretRight, Globe, Plugs, Code } from '@phosphor-icons/react';
import type { ToolCall } from '../types';

interface ToolCardProps {
  toolCalls: ToolCall[];
  results: Record<string, string>;
}

function getToolIcon(name: string) {
  if (name === 'search_web') return <Globe size={18} weight="regular" />;
  if (name.startsWith('mcp__')) return <Plugs size={18} weight="regular" />;
  return <Code size={18} weight="regular" />;
}

function displayName(name: string): string {
  if (name.startsWith('mcp__')) return name.split('__').slice(2).join('__') || name;
  return name;
}

function sourceName(name: string): string {
  if (name.startsWith('mcp__')) return name.split('__')[1] || '';
  return '';
}

export default function ToolCard({ toolCalls, results }: ToolCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [openResults, setOpenResults] = useState<Record<string, boolean>>({});

  const allDone = toolCalls.every((tc) => results[tc.id]);

  return (
    <div className="tool-card">
      {/* Card 头部 */}
      <button className="tool-card__header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-card__arrow">
          {expanded ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
        </span>
        <span className={`tool-card__badge ${allDone ? 'tool-card__badge--done' : 'tool-card__badge--pending'}`}>
          {toolCalls.length}
        </span>
        <span className="tool-card__summary">
          {allDone ? `已调用 ${toolCalls.length} 个工具` : `正在执行 ${toolCalls.length} 个工具…`}
        </span>
      </button>

      {/* 展开体 */}
      {expanded && (
        <div className="tool-card__body">
          {toolCalls.map((tc) => {
            const result = results[tc.id];
            const icon = getToolIcon(tc.function.name);
            const dName = displayName(tc.function.name);
            const src = sourceName(tc.function.name);
            const resultOpen = openResults[tc.id] ?? !!result;

            let argsFormatted = '';
            try {
              const parsed = JSON.parse(tc.function.arguments);
              argsFormatted = JSON.stringify(parsed, null, 2);
            } catch {
              argsFormatted = tc.function.arguments;
            }

            return (
              <div key={tc.id} className="tool-card__item">
                <div className="tool-card__item-header">
                  <span className="tool-card__item-icon">{icon}</span>
                  <span className="tool-card__item-name">{dName}</span>
                  {src && <span className="tool-card__item-source">{src}</span>}
                </div>

                <div className="tool-card__item-label">参数</div>
                <pre className="tool-card__code">{argsFormatted || '{}'}</pre>

                {result ? (
                  <>
                    <div className="tool-card__item-actions">
                      <button
                        className="tool-card__action-btn"
                        onClick={() => setOpenResults((p) => ({ ...p, [tc.id]: !p[tc.id] }))}
                      >
                        <span className="tool-card__action-arrow">
                          {resultOpen ? <CaretDown size={12} /> : <CaretRight size={12} />}
                        </span>
                        {resultOpen ? '收起返回结果' : '展开返回结果'}
                      </button>
                    </div>
                    {resultOpen && (
                      <div className="tool-card__result">
                        <pre className="tool-card__code tool-card__code--result">{result}</pre>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="tool-card__pending">
                    <span className="tool-card__pending-dot" />
                    等待执行结果…
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
