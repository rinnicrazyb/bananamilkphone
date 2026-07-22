/**
 * ChatView — 窗口化聊天消息列表
 *
 * 数据源：chat-message-db（SQLite messages 表，按需分页）
 * 渲染策略：始终只渲染窗口内的 ~100 条消息；滚顶加载更早的消息；
 *           新消息到达时追加到窗口尾部并自动滚底
 *
 * DOM 节点数始终由窗口大小控制，iframe 不被回收，无虚拟滚动。
 */
import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useChatStore } from '../store/chat-store';
import type { Message, MessageNode } from '../types';
import { DEFAULT_DISPLAY_CONFIG } from '../types';
import MessageRenderer from './MessageRenderer';
import MessageContextMenu from './MessageContextMenu';
import MessageEditDrawer from './MessageEditDrawer';
import ExportDrawer from './ExportDrawer';
import { regenerateMessage } from '../../../services/chat-send/index';
import { sendMessage as resendMessage } from '../../../services/chat-send/index';
import { getCurrentMessages } from '../../../services/message-nodes/index';
import {
  getWindowMessages,
  getMessageCount,
  deleteMessage as dbDeleteMessage,
} from '../../../services/chat-message-db';

const INITIAL_WINDOW = 80;
const LOAD_MORE = 50;
const SCROLL_BOTTOM_THRESHOLD = 100;

export default function ChatView() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const agents = useChatStore((s) => s.agents);
  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const currentAgent = agents.find((a) => a.id === activeConv?.agentId);
  const displayConfig = currentAgent?.displayConfig ?? DEFAULT_DISPLAY_CONFIG;

  // ── 背景 ──
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

  // ── 窗口状态 ──
  const [windowMessages, setWindowMessages] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);

  // DOM refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevTotalRef = useRef(0);

  // ── 消息操作状态 ──
  const [editMsg, setEditMsg] = useState<{ id: string; content: string; resend?: boolean } | null>(null);
  const [copyMsg, setCopyMsg] = useState<{ id: string; content: string } | null>(null);
  const [showExport, setShowExport] = useState(false);

  const getMenuActions = useCallback((msg: Message) => {
    const acts: Array<{ label: string; icon: string; onClick: () => void; danger?: boolean }> = [
      { label: '复制', icon: 'Copy', onClick: () => setCopyMsg({ id: msg.id, content: msg.content }) },
    ];
    if (msg.role === 'user') {
      acts.push({ label: '重新发送', icon: 'PaperPlaneTilt', onClick: () => {
        // 打开编辑窗口，标注为重新发送（保存时触发 LLM 调用）
        setEditMsg({ id: msg.id, content: msg.content, resend: true });
      }});
    }
    if (msg.role === 'assistant') {
      acts.push({ label: '重新生成', icon: 'ArrowsClockwise', onClick: () => {
        if (!activeConversationId) return;
        regenerateMessage(activeConversationId, msg.id).catch(() => {});
      }});
    }
    acts.push(
      { label: '编辑', icon: 'PencilSimple', onClick: () => setEditMsg({ id: msg.id, content: msg.content }) },
      { label: '导出', icon: 'DownloadSimple', onClick: () => setShowExport(true) },
      { label: '删除', icon: 'Trash', onClick: () => {
        if (!activeConversationId) return;
        if (window.confirm('确定删除这条消息？')) {
          // 从 messageNodes 和 db 中删除
          useChatStore.setState((s) => {
            const nodes = s.messageNodes[activeConversationId] || [];
            const newNodes = nodes
              .map(n => {
                const filtered = n.messages.filter(m => m.id !== msg.id);
                return filtered.length > 0 ? { ...n, messages: filtered, selectedIndex: Math.min(n.selectedIndex, filtered.length - 1) } : null;
              })
              .filter(Boolean) as MessageNode[];
            const full = { ...s.messageNodes, [activeConversationId]: newNodes };
            const newMsgs: Record<string, Message[]> = {};
            for (const [k, v] of Object.entries(full)) newMsgs[k] = getCurrentMessages(v);
            return { messageNodes: full, messages: newMsgs };
          });
          dbDeleteMessage(msg.id).catch(() => {});
          setWindowMessages(prev => prev.filter(m => m.id !== msg.id));
        }
      }, danger: true },
    );
    return acts;
  }, [activeConversationId]);

  // ── 初始加载 / 对话切换 ──
  const loadInitialWindow = useCallback(async (convId: string) => {
    // 优先从 store 读取（即时可用），DB 作为补充
    const storeMsgs = useChatStore.getState().messages[convId] || [];
    const storeSorted = [...storeMsgs].sort((a, b) => a.timestamp - b.timestamp).filter(m => m.role !== 'tool');

    if (storeSorted.length > 0) {
      // 从 store 加载最近 INITIAL_WINDOW 条
      const sliced = storeSorted.slice(-INITIAL_WINDOW);
      setWindowMessages(sliced);
      setTotal(storeSorted.length);
      prevTotalRef.current = storeSorted.length;
      // 异步同步到 messages 表
      import('../../../services/chat-message-db').then(({ getMessageCount }) => {
        getMessageCount(convId).then(dbCount => {
          if (dbCount < storeSorted.length) {
            // DB 落后，触发补充写入
            import('../../../services/chat-message-db').then(({ insertMessages }) => {
              insertMessages(storeMsgs).catch(() => {});
            });
          }
        });
      });
      return;
    }

    // store 为空，尝试 DB
    const totalCount = await getMessageCount(convId);
    setTotal(totalCount);
    prevTotalRef.current = totalCount;

    if (totalCount === 0) {
      // 检查 await 期间是否已被 syncFromStore 更新（用户发送了消息）
      const currentMsgs = useChatStore.getState().messages[convId] || [];
      if (currentMsgs.length > 0) return;
      setWindowMessages([]);
      return;
    }

    const start = Math.max(0, totalCount - INITIAL_WINDOW);
    const { items } = await getWindowMessages(convId, start, INITIAL_WINDOW);
    setWindowMessages(items);
  }, []);

  useEffect(() => {
    if (activeConversationId) {
      loadInitialWindow(activeConversationId);
    } else {
      setWindowMessages([]);
      setTotal(0);
    }
  }, [activeConversationId, loadInitialWindow]);

  // ── 加载更早消息 ──
  const handleLoadMore = useCallback(async () => {
    if (loadingRef.current) return;
    const firstMsg = windowMessages[0];
    if (!firstMsg || !activeConversationId) return;

    loadingRef.current = true;
    setLoadingMore(true);

    const el = scrollRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;

    // 加载更多：从当前窗口往前取 LOAD_MORE 条
    const currentTail = windowMessages.length;
    const currentStart = Math.max(0, total - currentTail);
    const newStart = Math.max(0, currentStart - LOAD_MORE);
    const count = currentStart - newStart + currentTail;

    const { items } = await getWindowMessages(activeConversationId, newStart, count);
    setWindowMessages(items);

    // 恢复滚动位置
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight - prevScrollHeight;
      });
    }

    loadingRef.current = false;
    setLoadingMore(false);
  }, [windowMessages, total, activeConversationId]);

  // ── 顶部哨兵 IntersectionObserver ──
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const el = scrollRef.current;
    if (!sentinel || !el) return;

    const hasMore = windowMessages.length > 0 && windowMessages.length < total;
    if (!hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) handleLoadMore();
      },
      { root: el, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [windowMessages.length, total, handleLoadMore]);

  // ── 从 store 同步窗口内容（任何时候 store 变化都调用）──
  const syncFromStore = useCallback(() => {
    if (!activeConversationId) return;
    const currentMsgs = useChatStore.getState().getCurrentMessages(activeConversationId);
    const nonTool = currentMsgs.filter(m => m.role !== 'tool');
    const newTotal = nonTool.length;
    prevTotalRef.current = newTotal;
    setTotal(newTotal);
    setWindowMessages(nonTool.slice(-INITIAL_WINDOW));
  }, [activeConversationId]);

  // 监听 store 任何变化（不只是长度），流式更新也触发
  useEffect(() => {
    if (!activeConversationId) return;
    const unsub = useChatStore.subscribe(() => {
      syncFromStore();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  // ── 滚动追踪 ──
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD;
  }, []);

  // ── 自动滚到底部 ──
  const prevLenRef = useRef(windowMessages.length);
  useEffect(() => {
    if (displayConfig.autoScroll !== false && windowMessages.length > prevLenRef.current && isAtBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
    prevLenRef.current = windowMessages.length;
  }, [windowMessages.length, displayConfig.autoScroll]);

  // 首次加载滚底
  useEffect(() => {
    if (windowMessages.length > 0) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, []); // eslint-disable-line

  // ── tool 结果映射 ──
  const toolResults = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of windowMessages) {
      if (m.role === 'tool' && m.toolCallId) map[m.toolCallId] = m.content;
    }
    return map;
  }, [windowMessages]);

  // ── 空状态 ──
  if (total === 0) {
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
        {windowMessages.length < total && (
          <>
            <div ref={topSentinelRef} style={{ height: 1, width: '100%' }} />
            <div style={{ textAlign: 'center', padding: 8, fontSize: 12, color: 'var(--app-text-secondary)' }}>
              {loadingMore ? '加载中...' : '上滑加载更早消息'}
            </div>
          </>
        )}

        {/* 消息列表 */}
        {windowMessages
          .filter((m) => m.role !== 'tool')
          .map((msg) => {
            const isAssistant = msg.role === 'assistant';
            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                data-message-id={msg.id}
                style={{ padding: '4px 0' }}
              >
                <MessageContextMenu actions={getMenuActions(msg)}>
                  <MessageRenderer
                    message={msg}
                    config={displayConfig}
                    isAssistant={isAssistant}
                    toolResults={toolResults}
                    showAvatar={displayConfig.showAvatars}
                    agentAvatar={currentAgent?.avatar ?? ''}
                    userAvatar={displayConfig.userAvatar}
                  />
                </MessageContextMenu>
              </div>
            );
          })}
      </div>

      {/* 编辑/复制底部窗口 */}
      <MessageEditDrawer
        open={!!editMsg || !!copyMsg}
        content={editMsg?.content || copyMsg?.content || ''}
        editable={!!editMsg}
        onSave={(newContent) => {
          if (editMsg) {
            // 同步 windowMessages
            setWindowMessages(prev => prev.map(m => m.id === editMsg.id ? { ...m, content: newContent } : m));
            // 同步 chat-store（清除 parts 使回退到 content 渲染）
            if (activeConversationId) {
              useChatStore.getState().editMessageContent(activeConversationId, editMsg.id, newContent);
            }
            // 同步 DB
            import('../../../services/chat-message-db').then(({ updateMessage }) => {
              updateMessage(editMsg.id, { content: newContent }).catch(() => {});
            });
          }
        }}
        onResend={editMsg?.resend ? (newContent) => {
          if (editMsg && activeConversationId) {
            // 1. 以新消息身份添加编辑后的内容到 store
            const newUserMsg = {
              id: `msg-${Date.now()}`,
              conversationId: activeConversationId,
              role: 'user' as const,
              content: newContent,
              timestamp: Date.now(),
              status: 'sent' as const,
            };
            useChatStore.getState().addMessage(activeConversationId, newUserMsg);
            // 2. 正常调用 sendMessage（不加 fromResendMsgId）
            resendMessage(activeConversationId, newContent).catch(() => {});
          }
        } : undefined}
        onClose={() => { setEditMsg(null); setCopyMsg(null); }}
      />
      <ExportDrawer
        open={showExport}
        messages={windowMessages}
        conversationTitle={activeConv?.title || '对话'}
        onClose={() => setShowExport(false)}
      />
    </>
  );
}
