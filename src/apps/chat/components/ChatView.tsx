import { Spinner, Check, Checks, Warning, Lightning } from '@phosphor-icons/react';
import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useChatStore } from '../store/chat-store';
import type { Message } from '../types';
import { DEFAULT_DISPLAY_CONFIG } from '../types';
import AgentAvatar from './AgentAvatar';
import ToolCard from './ToolCard';

function MessageBubble({ msg, thinkingCollapsed, agentAvatar, displayConfig, isLastInRound, showAvatar }: {
  msg: Message; thinkingCollapsed: boolean; agentAvatar: string;
  displayConfig: typeof DEFAULT_DISPLAY_CONFIG; isLastInRound?: boolean; showAvatar?: boolean;
}) {
  const bubbleImg = msg.role === 'user' ? displayConfig.userBubbleImage : displayConfig.assistantBubbleImage;
  const useBubbleImg = displayConfig.useBubbles && bubbleImg;
  const noBubble = msg.role === 'assistant' && !displayConfig.useBubbles;
  const bubbleStyle: React.CSSProperties = useBubbleImg ? {
    backgroundImage: `url(${bubbleImg})`,
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    backgroundColor: 'transparent',
    border: 'none',
    padding: '14px 18px',
  } : {};

  const showAvatarHere = showAvatar ?? true;

  return (
    <div className={`chat-bubble-row chat-bubble-row--${msg.role}`}>
      {displayConfig.showAvatars && showAvatarHere && msg.role === 'assistant' && (
        <div className="chat-bubble__avatar chat-bubble__avatar--assistant">
          <AgentAvatar avatar={agentAvatar} className="chat-bubble__avatar-img" frameSrc={displayConfig.agentAvatarFrame} />
        </div>
      )}
      {displayConfig.showAvatars && showAvatarHere && msg.role === 'user' && (
        <div className="chat-bubble__avatar chat-bubble__avatar--user" style={{ order: 1 }}>
          <div className="chat-bubble__avatar-img" style={{ fontSize: 18, position: 'relative' }}>
            {displayConfig.userAvatar ? (
              <img src={displayConfig.userAvatar} alt="用户头像" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            ) : (
              <div className="chat-bubble__avatar-blank" />
            )}
            {displayConfig.userAvatarFrame && (
              <img src={displayConfig.userAvatarFrame} alt="头像框" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
            )}
          </div>
        </div>
      )}
      <div
        id={`msg-${msg.id}`}
        className={`chat-bubble chat-bubble--${msg.role}${useBubbleImg ? ' chat-bubble--custom-img' : ''}${noBubble ? ' chat-bubble--no-bg' : ''}`}
        style={bubbleStyle}
      >
        {msg.reasoning && (
          <details className="chat-bubble__reasoning" open={!thinkingCollapsed}>
            <summary>思考链</summary>
            <pre>{msg.reasoning}</pre>
          </details>
        )}
        <div className="chat-bubble__content">{msg.content}</div>
        <div className="chat-bubble__meta">
          {displayConfig.showTime && (
            <span className="chat-bubble__time">
              {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          {msg.role === 'user' && (
            <span className={`chat-bubble__status chat-bubble__status--${msg.status}`}>
              {msg.status === 'sending' ? <Spinner size={14} className="spin" /> : msg.status === 'sent' ? <Check size={14} /> : msg.status === 'read' ? <Checks size={14} /> : <Warning size={14} />}
            </span>
          )}
          {msg.role === 'assistant' && (
            <span className={`chat-bubble__status chat-bubble__status--${msg.status}`}>
              {msg.status === 'sending' ? <Spinner size={14} className="spin" /> : msg.status === 'sent' ? <Check size={14} /> : <Warning size={14} />}
            </span>
          )}
          {displayConfig.showTokens && msg.tokenCount && isLastInRound && (
            <span className="chat-bubble__time" style={{ marginLeft: 4 }}>
              ↑{msg.tokenCount.prompt}/↓{msg.tokenCount.completion}{msg.tokenCount.cached ? <> <Lightning size={12} />{msg.tokenCount.cached}</> : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** 按段分割渲染：将 assistant 消息按 \\n{2,} 切分成多个独立气泡 */
function SegmentedMessageBubble({ msg, thinkingCollapsed, agentAvatar, displayConfig, isLastInRound }: {
  msg: Message; thinkingCollapsed: boolean; agentAvatar: string;
  displayConfig: typeof DEFAULT_DISPLAY_CONFIG; isLastInRound?: boolean;
}) {
  const segments = msg.content.split(/\n{2,}/).filter(Boolean);
  const bubbleFollow = displayConfig.bubbleFollowAvatar;
  const avatarWidth = 36;
  const bubbleImg = displayConfig.assistantBubbleImage;
  const useBubbleImg = displayConfig.useBubbles && bubbleImg;
  const bubbleStyle: React.CSSProperties = useBubbleImg ? {
    backgroundImage: `url(${bubbleImg})`,
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    backgroundColor: 'transparent',
    border: 'none',
    padding: '14px 18px',
  } : {};

  return (
    <>
      {/* 思考链：用空白占位保持与正文左侧对齐 */}
      {msg.reasoning && (
        <div className="chat-bubble-row" style={{ alignItems: 'flex-start' }}>
          {displayConfig.showAvatars && (
            <div style={{ width: avatarWidth, height: avatarWidth, flexShrink: 0 }} />
          )}
          <details className="chat-bubble__reasoning chat-bubble__reasoning--standalone" open={!thinkingCollapsed} style={{ marginLeft: 0, maxWidth: '85%' }}>
            <summary>思考链</summary>
            <pre>{msg.reasoning}</pre>
          </details>
        </div>
      )}
      {/* 分段气泡 */}
      {segments.map((seg, i) => (
        <div key={i} className="chat-bubble-row chat-bubble-row--assistant">
          {displayConfig.showAvatars && (bubbleFollow ? true : i === 0) ? (
            <div className="chat-bubble__avatar chat-bubble__avatar--assistant">
              <AgentAvatar avatar={agentAvatar} className="chat-bubble__avatar-img" frameSrc={displayConfig.agentAvatarFrame} />
            </div>
          ) : displayConfig.showAvatars ? (
            <div style={{ width: avatarWidth, flexShrink: 0 }} />
          ) : null}
          <div
            className={`chat-bubble chat-bubble--assistant${!displayConfig.useBubbles ? ' chat-bubble--no-bg' : ''}${useBubbleImg ? ' chat-bubble--custom-img' : ''}`}
            style={bubbleStyle}
          >
            <div className="chat-bubble__content">{seg}</div>
            <div className="chat-bubble__meta">
              {displayConfig.showTime && i === segments.length - 1 && (
                <span className="chat-bubble__time">
                  {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {i === segments.length - 1 && (
                <span className="chat-bubble__status">
                  {msg.status === 'sending' ? <Spinner size={14} className="spin" /> : msg.status === 'sent' ? <Check size={14} /> : <Warning size={14} />}
                </span>
              )}
              {displayConfig.showTokens && msg.tokenCount && isLastInRound && i === segments.length - 1 && (
                <span className="chat-bubble__time" style={{ marginLeft: 4 }}>
                  ↑{msg.tokenCount.prompt}/↓{msg.tokenCount.completion}{msg.tokenCount.cached ? <> <Lightning size={12} />{msg.tokenCount.cached}</> : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export default function ChatView() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const rawMessages = useChatStore((s) =>
    activeConversationId ? s.messages[activeConversationId] : undefined
  );
  const messages = rawMessages ?? ([] as Message[]);
  const thinkingCollapsed = useChatStore((s) => s.thinkingChainCollapsed);
  const conversations = useChatStore((s) => s.conversations);
  const agents = useChatStore((s) => s.agents);
  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const currentAgent = agents.find((a) => a.id === activeConv?.agentId);
  const displayConfig = currentAgent?.displayConfig ?? DEFAULT_DISPLAY_CONFIG;

  const bgFixedStyle: React.CSSProperties | null = useMemo(() => {
    if (!displayConfig.bgImage) return null;
    const blur = displayConfig.bgBlur ?? 0;
    const opacity = displayConfig.bgOpacity ?? 1;
    return {
      backgroundImage: `url(${displayConfig.bgImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      position: 'fixed' as const,
      inset: 0,
      zIndex: 0,
      opacity,
      filter: blur > 0 ? `blur(${blur}px)` : undefined,
      pointerEvents: 'none',
    };
  }, [displayConfig.bgImage, displayConfig.bgOpacity, displayConfig.bgBlur]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const sorted = useMemo(
    () => [...messages].sort((a, b) => a.timestamp - b.timestamp),
    [messages]
  );

  // 过滤掉 role:tool 的消息（它们会内嵌在 ToolCard 中显示）
  const displayMessages = useMemo(
    () => sorted.filter((m) => m.role !== 'tool'),
    [sorted]
  );

  // 构建 tool 结果映射: tool_call_id → content
  const toolResults = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of sorted) {
      if (m.role === 'tool' && m.toolCallId) {
        map[m.toolCallId] = m.content;
      }
    }
    return map;
  }, [sorted]);

  const virtualizer = useVirtualizer({
    count: displayMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 10,
  });

  // Infinite scroll: IntersectionObserver on top sentinel
  const handleLoadMore = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    console.log('[ChatView] Load more messages (stub)');
    setTimeout(() => { loadingRef.current = false; }, 500);
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || sorted.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) { handleLoadMore(); }
      },
      { root: scrollRef.current, threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sorted.length, handleLoadMore]);

  const lastMsgId = messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (scrollRef.current && sorted.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lastMsgId, sorted.length]);

  if (displayMessages.length === 0) {
    return (
      <div className="chat-view" ref={scrollRef}>
        {bgFixedStyle && <div style={bgFixedStyle} />}
        <div className="chat-view__empty">开始对话吧</div>
      </div>
    );
  }

  return (
    <>
      {bgFixedStyle && <div style={bgFixedStyle} />}
      <div className="chat-view" ref={scrollRef}>
      <div ref={sentinelRef} style={{ height: 1, width: '100%' }} />
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
          {virtualizer.getVirtualItems().map((virtualItem) => {
          const msg = displayMessages[virtualItem.index];
          const isLastInRound = msg.role === 'assistant' && (
            virtualItem.index === displayMessages.length - 1 ||
            (virtualItem.index + 1 < displayMessages.length && displayMessages[virtualItem.index + 1].role === 'user')
          );
          // 渲染使用 displayMessages 的长度和索引
          const hasToolCalls = msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0;
          return (
            <div
              key={msg.id}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {/* 内嵌工具调用卡片 */}
              {hasToolCalls && msg.toolCalls && (
                <ToolCard toolCalls={msg.toolCalls} results={toolResults} />
              )}
              {msg.role === 'assistant' && displayConfig.segmentBubbles ? (
                <SegmentedMessageBubble msg={msg} thinkingCollapsed={thinkingCollapsed} agentAvatar={currentAgent?.avatar ?? ''} displayConfig={displayConfig} isLastInRound={isLastInRound} />
              ) : (
                <MessageBubble msg={msg} thinkingCollapsed={thinkingCollapsed} agentAvatar={currentAgent?.avatar ?? ''} displayConfig={displayConfig} isLastInRound={isLastInRound} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  </>);
}
