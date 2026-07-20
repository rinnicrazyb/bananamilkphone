/**
 * ChatView — 聊天消息列表
 *
 * 普通滚动 + 分页加载（TauriTavern 风格）：
 * - 初始加载最近 50 条消息
 * - 滚动到顶部时自动加载更早消息（插入前部，保留滚动位置）
 * - 所有已加载消息永久保留在 DOM 中，iframe 不会被回收
 * - 新消息到达时若用户在底部则自动滚到底部
 */
import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useChatStore } from '../store/chat-store';
import type { Message } from '../types';
import { DEFAULT_DISPLAY_CONFIG } from '../types';
import MessageRenderer from './MessageRenderer';

const INITIAL_LOAD = 50;
const LOAD_MORE = 50;
const SCROLL_BOTTOM_THRESHOLD = 100;

export default function ChatView() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const rawMessages = useChatStore((s) =>
    activeConversationId ? s.messages[activeConversationId] : undefined
  );
  const messages = rawMessages ?? ([] as Message[]);
  const conversations = useChatStore((s) => s.conversations);
  const agents = useChatStore((s) => s.agents);
  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const currentAgent = agents.find((a) => a.id === activeConv?.agentId);
  const displayConfig = currentAgent?.displayConfig ?? DEFAULT_DISPLAY_CONFIG;

  const bgFixedStyle: React.CSSProperties | null = useMemo(() => {
    if (!displayConfig.bgImage) return null;
    return {
      backgroundImage: `url(${displayConfig.bgImage})`,
      backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
      position: 'fixed' as const, inset: 0, zIndex: 0,
      opacity: displayConfig.bgOpacity ?? 1,
      filter: (displayConfig.bgBlur ?? 0) > 0 ? `blur(${displayConfig.bgBlur}px)` : undefined,
      pointerEvents: 'none',
    };
  }, [displayConfig.bgImage, displayConfig.bgOpacity, displayConfig.bgBlur]);

  // 数据处理
  const sorted = useMemo(() => [...messages].sort((a, b) => a.timestamp - b.timestamp), [messages]);
  const displayMessages = useMemo(() => sorted.filter((m) => m.role !== 'tool'), [sorted]);
  const toolResults = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of sorted) { if (m.role === 'tool' && m.toolCallId) map[m.toolCallId] = m.content; }
    return map;
  }, [sorted]);

  // 分页状态：显示末尾多少条
  const [visibleCount, setVisibleCount] = useState(() => Math.min(INITIAL_LOAD, displayMessages.length));
  const visibleMessages = useMemo(() => displayMessages.slice(-visibleCount), [displayMessages, visibleCount]);

  // 切换对话时重置分页
  useEffect(() => {
    setVisibleCount(Math.min(INITIAL_LOAD, displayMessages.length));
  }, [activeConversationId]); // eslint-disable-line

  // DOM refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevMsgCountRef = useRef(displayMessages.length);
  const prevVisibleCountRef = useRef(visibleCount);
  const loadMoreScrollRef = useRef<{ prevScrollHeight: number } | null>(null);
  const loadingRef = useRef(false);

  // 追踪用户是否在底部
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD;
  }, []);

  // 加载更早消息
  const handleLoadMore = useCallback(() => {
    if (loadingRef.current || visibleCount >= displayMessages.length) return;
    loadingRef.current = true;
    const el = scrollRef.current;
    if (el) {
      loadMoreScrollRef.current = { prevScrollHeight: el.scrollHeight };
    }
    setVisibleCount((prev) => Math.min(prev + LOAD_MORE, displayMessages.length));
  }, [visibleCount, displayMessages.length]);

  // 加载更多后恢复滚动位置（新增消息插入在前部）
  useEffect(() => {
    if (loadMoreScrollRef.current) {
      const el = scrollRef.current;
      if (el) {
        const newScrollHeight = el.scrollHeight;
        const prevScrollHeight = loadMoreScrollRef.current.prevScrollHeight;
        el.scrollTop = newScrollHeight - prevScrollHeight;
      }
      loadMoreScrollRef.current = null;
    }
    prevVisibleCountRef.current = visibleCount;
  }, [visibleCount]);

  // 顶部哨兵：检测滚动到顶，触发加载更早消息
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || visibleCount >= displayMessages.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) handleLoadMore();
      },
      { root: scrollRef.current, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, displayMessages.length, handleLoadMore]);

  // 新消息自动滚动到底部（仅当用户在底部时）
  useEffect(() => {
    if (displayMessages.length > prevMsgCountRef.current && isAtBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
    prevMsgCountRef.current = displayMessages.length;
  }, [displayMessages.length]);

  // 首次加载/切换对话时滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el && visibleMessages.length > 0) {
      el.scrollTop = el.scrollHeight;
    }
  }, [activeConversationId, visibleCount]); // eslint-disable-line

  // ========== 渲染 ==========

  if (displayMessages.length === 0) {
    return (
      <div className="chat-view" ref={scrollRef} onScroll={handleScroll}>
        {bgFixedStyle && <div style={bgFixedStyle} />}
        <div className="chat-view__empty">开始对话吧</div>
      </div>
    );
  }

  return (
    <>
      {bgFixedStyle && <div style={bgFixedStyle} />}
      <div className="chat-view" ref={scrollRef} onScroll={handleScroll}>
        {/* 顶部哨兵：检测是否需要加载更早消息 */}
        {visibleCount < displayMessages.length && (
          <div ref={topSentinelRef} style={{ height: 1, width: '100%' }} />
        )}
        {visibleCount < displayMessages.length && (
          <div style={{ textAlign: 'center', padding: 8, fontSize: 12, color: 'var(--app-text-secondary)' }}>
            加载更早消息...
          </div>
        )}

        {/* 消息列表 */}
        {visibleMessages.map((msg) => {
          const isAssistant = msg.role === 'assistant';
          return (
            <div key={msg.id} style={{ padding: '4px 0' }}>
              <MessageRenderer
                message={msg}
                config={displayConfig}
                isAssistant={isAssistant}
                toolResults={toolResults}
                showAvatar={displayConfig.showAvatars}
                agentAvatar={currentAgent?.avatar ?? ''}
                userAvatar={displayConfig.userAvatar}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
