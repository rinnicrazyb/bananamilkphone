/**
 * MessageRenderer — 消息内容渲染编排
 *
 * segmentBubbles=true（智能分段）：
 *   - 纯文本 → 气泡内（按 \n 分段），bubbleFollowAvatar 控制每段前是否跟头像
 *   - Markdown/HTML → 无气泡全宽
 *   - 工具链 → ChainOfThought 卡片（无头像）
 *   - 思考链 → ReasoningBlock 折叠（无头像）
 *
 * segmentBubbles=false（RikkaHub 风格）：
 *   - 所有文字连续渲染在一个气泡/块中
 */
import { useMemo } from 'react';
import { Lightning, Spinner, Check, Checks, Warning } from '@phosphor-icons/react';
import type { Message, MessagePart } from '../types';
import MarkdownRenderer, { hasMarkdownOrHtml } from './MarkdownRenderer';
import InteractiveHTML from './InteractiveHTML';
import ChainOfThought from './ChainOfThought';
import ReasoningBlock from './ReasoningBlock';


interface MessageRendererProps {
  message: Message;
  config: {
    useBubbles: boolean;
    segmentBubbles: boolean;
    bubbleFollowAvatar: boolean;
    showTime: boolean;
    showTokens: boolean;
    userBubbleImage?: string;
    assistantBubbleImage?: string;
    userAvatarFrame?: string;
    agentAvatarFrame?: string;
  };
  isAssistant: boolean;
  toolResults?: Record<string, string>;
  /** 头像渲染所需 */
  showAvatar?: boolean;
  agentAvatar?: string;
  userAvatar?: string;
}

import { useChatStore } from '../store/chat-store';

function getParts(message: Message): MessagePart[] {
  if (message.parts && message.parts.length > 0) return message.parts;
  const parts: MessagePart[] = [];
  if (message.reasoning) parts.push({ type: 'reasoning', content: message.reasoning, finishedAt: Date.now() });
  if (message.content) parts.push({ type: 'text', content: message.content });
  if (message.toolCalls) {
    for (const tc of message.toolCalls) {
      parts.push({ type: 'tool_call', toolCallId: tc.id, toolName: tc.function.name, input: tc.function.arguments, isExecuted: false, approvalState: 'auto' });
    }
  }
  return parts;
}

function groupParts(parts: MessagePart[]): Array<{ type: 'thinking' | 'content'; parts: MessagePart[] }> {
  const groups: Array<{ type: 'thinking' | 'content'; parts: MessagePart[] }> = [];
  let current: MessagePart[] = [];
  let currentType: 'thinking' | 'content' | null = null;
  for (const part of parts) {
    const isThinking = part.type === 'reasoning' || part.type === 'tool_call';
    const groupType: 'thinking' | 'content' = isThinking ? 'thinking' : 'content';
    if (currentType !== groupType) {
      if (current.length > 0) groups.push({ type: currentType!, parts: current });
      current = [part];
      currentType = groupType;
    } else { current.push(part); }
  }
  if (current.length > 0) groups.push({ type: currentType!, parts: current });
  return groups;
}

/** 渲染头像小元件 */
function AvatarIcon({ src, frame }: { src?: string; frame?: string }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', overflow: 'hidden',
      flexShrink: 0, position: 'relative',
    }}>
      {src ? (
        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'var(--app-border)', borderRadius: '50%' }} />
      )}
      {frame && (
        <img src={frame} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      )}
    </div>
  );
}

function renderSegmented(
  parts: MessagePart[], config: MessageRendererProps['config'],
  isAssistant: boolean, toolResults: Record<string, string> | undefined,
  showAvatar: boolean, agentAvatar?: string, userAvatar?: string,
  status?: string, timestamp?: number, tokenCount?: { prompt: number; completion: number; cached?: number },
  autoCollapse?: boolean, showTokens?: boolean,
) {
  const groups = groupParts(parts);
  const elements: React.ReactNode[] = [];
  let firstTextSegment = true;

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    if (group.type === 'thinking') {
      const toolSteps = group.parts
        .filter((p): p is MessagePart & { type: 'tool_call' } => p.type === 'tool_call')
        .map((p) => ({ toolCallId: p.toolCallId, toolName: p.toolName, input: p.input, output: p.output, isExecuted: p.isExecuted ?? false }));
      const reasoningParts = group.parts.filter((p) => p.type === 'reasoning');
      elements.push(
        <div key={`thinking-${gi}`} style={{ margin: '4px 0' }}>
          {reasoningParts.map((rp, ri) => (
            <ReasoningBlock key={`reason-${gi}-${ri}`} content={rp.content} isLoading={!rp.finishedAt} autoCollapse={autoCollapse} />
          ))}
          {toolSteps.length > 0 && <ChainOfThought steps={toolSteps} toolResults={toolResults} autoCollapse={autoCollapse} />}
        </div>
      );
      continue;
    }

    for (let pi = 0; pi < group.parts.length; pi++) {
      const part = group.parts[pi];
      const key = `content-${gi}-${pi}`;

      if (part.type === 'image') {
        elements.push(<div key={key} style={{ margin: '4px 0' }}><img src={part.url} alt="" style={{ maxWidth: '100%', borderRadius: 8 }} /></div>);
        continue;
      }
      if (part.type === 'html') {
        elements.push(<div key={key} style={{ margin: '4px 0' }}><InteractiveHTML html={part.content} /></div>);
        continue;
      }
      if (part.type === 'text') {
        const isFormatted = hasMarkdownOrHtml(part.content);
        const isInBubble = config.useBubbles && !isFormatted;

        if (isInBubble) {
          // 纯文本气泡 — 按\n分段，气泡跟随头像
          const segments = part.content.split('\n').filter(Boolean);
          segments.forEach((seg, si) => {
            const showHere = showAvatar && (config.bubbleFollowAvatar ? true : firstTextSegment && si === 0);
            if (showHere) firstTextSegment = false;
            elements.push(
              <div key={`seg-${key}-${si}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4, justifyContent: !showAvatar ? (isAssistant ? 'flex-start' : 'flex-end') : undefined }}>
                {showHere && showAvatar && (
                  <div style={{ order: isAssistant ? 0 : 1 }}>
                    <AvatarIcon
                      src={isAssistant ? agentAvatar : userAvatar}
                      frame={isAssistant ? config.agentAvatarFrame : config.userAvatarFrame}
                    />
                  </div>
                )}
                {!showHere && showAvatar && <div style={{ width: 36, flexShrink: 0, order: isAssistant ? 0 : 1 }} />}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: isAssistant ? 'flex-start' : 'flex-end' }}>
                  <div className={`bubble ${isAssistant ? 'bubble--assistant' : 'bubble--user'}`} style={{
                    margin: '3px 0', padding: '8px 12px', borderRadius: 12,
                    background: isAssistant
                      ? config.assistantBubbleImage ? `url(${config.assistantBubbleImage})` : 'var(--app-secondary)'
                      : config.userBubbleImage ? `url(${config.userBubbleImage})` : 'var(--app-primary)',
                    color: isAssistant ? 'var(--app-text)' : '#fff',
                    maxWidth: '85%', width: 'fit-content', wordBreak: 'break-word',
                  }}>{seg}</div>
                  {(config.showTime || (showTokens && tokenCount)) && si === segments.length - 1 && (
                    <div style={{
                      fontSize: 11, color: 'var(--app-text-secondary)',
                      display: 'flex', alignItems: 'center', gap: 4,
                      justifyContent: isAssistant ? 'flex-start' : 'flex-end',
                      padding: '2px 4px 0',
                    }}>
                      {!isAssistant && status && renderStatusIcon(status)}
                      {config.showTime && <span>{new Date(timestamp || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>}
                      {showTokens && tokenCount && <span><Lightning size={11} />↑{tokenCount.prompt}/↓{tokenCount.completion}{tokenCount.cached ? <><Lightning size={11} />{tokenCount.cached}</> : ''}</span>}
                      {isAssistant && status && renderStatusIcon(status)}
                    </div>
                  )}
                </div>
              </div>
            );
          });
        } else {
          // 格式化内容（Markdown/HTML）→ 无气泡全宽，MarkdownRenderer 内部处理 html 代码块
          elements.push(<div key={key} style={{ margin: '4px 0' }}><MarkdownRenderer content={part.content} /></div>);
        }
      }
    }
  }
  return elements;
}

function renderStatusIcon(status: string) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {status === 'sending' ? <Spinner size={11} className="spin" /> :
       status === 'sent' ? <Check size={11} /> :
       status === 'read' ? <Checks size={11} /> :
       <Warning size={11} />}
    </span>
  );
}

function renderContinuous(parts: MessagePart[], config: MessageRendererProps['config'], isAssistant: boolean, toolResults?: Record<string, string>, status?: string, timestamp?: number, tokenCount?: { prompt: number; completion: number; cached?: number }, autoCollapse?: boolean, showTokens?: boolean) {
  const elements: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.type === 'reasoning') elements.push(<ReasoningBlock key={`reason-${i}`} content={part.content} isLoading={!part.finishedAt} autoCollapse={autoCollapse} />);
    else if (part.type === 'tool_call') elements.push(<ChainOfThought key={`tool-${i}`} steps={[{ toolCallId: part.toolCallId, toolName: part.toolName, input: part.input, output: part.output, isExecuted: part.isExecuted ?? false }]} toolResults={toolResults} autoCollapse={autoCollapse} />);
    else if (part.type === 'html') { elements.push(<InteractiveHTML key={`html-${i}`} html={part.content} />); }
    else if (part.type === 'image') elements.push(<img key={`img-${i}`} src={part.url} alt="" style={{ maxWidth: '100%', borderRadius: 8, margin: '4px 0' }} />);
    else if (part.type === 'text') {
      elements.push(<MarkdownRenderer key={`text-${i}`} content={part.content} />);
    }
  }
  if (config.useBubbles) {
    const bgStyle = isAssistant
      ? config.assistantBubbleImage ? { backgroundImage: `url(${config.assistantBubbleImage})`, backgroundSize: 'cover' } : { background: 'var(--app-secondary)' }
      : config.userBubbleImage ? { backgroundImage: `url(${config.userBubbleImage})`, backgroundSize: 'cover' } : { background: 'var(--app-primary)', color: '#fff' };
    return (<div style={{ padding: '8px 12px', borderRadius: 12, maxWidth: '85%', width: 'fit-content', ...bgStyle, marginLeft: isAssistant ? undefined : 'auto' }}>{elements}{(config.showTime || (showTokens && tokenCount)) && <div style={{ fontSize: 11, color: 'var(--app-text-secondary)', display: 'flex', alignItems: 'center', gap: 4, justifyContent: isAssistant ? 'flex-start' : 'flex-end', marginTop: 4 }}>{!isAssistant && status && renderStatusIcon(status)}{config.showTime && <span>{new Date(timestamp || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>}{showTokens && tokenCount && <span><Lightning size={11} />↑{tokenCount.prompt}/↓{tokenCount.completion}{tokenCount.cached ? <><Lightning size={11} />{tokenCount.cached}</> : ''}</span>}{isAssistant && status && renderStatusIcon(status)}</div>}</div>);
  }
  return <div style={{ marginTop: 4, marginBottom: 4 }}>{elements}</div>;
}

export default function MessageRenderer(props: MessageRendererProps) {
  const { message, isAssistant, config, toolResults, showAvatar, agentAvatar, userAvatar } = props;
  const parts = useMemo(() => getParts(message), [message]);
  const { timestamp, tokenCount } = message;
  const autoCollapse = useChatStore((s) => s.thinkingChainCollapsed);
  const showTokens = config.showTokens as boolean | undefined;
  if (config.segmentBubbles) {
    return <>{renderSegmented(parts, config, isAssistant, toolResults, !!showAvatar, agentAvatar, userAvatar, message.status, timestamp, tokenCount, autoCollapse, showTokens)}</>;
  }
  return <>{renderContinuous(parts, config, isAssistant, toolResults, message.status, timestamp, tokenCount, autoCollapse, showTokens)}</>;
}
