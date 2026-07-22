/**
 * 上下文拼装页面 - 每个组件独立 details 区块
 *
 * 区块顺序（与后端管道完全一致）：
 *  1. 世界书注入·系统提示词前    ← 独立区块
 *  2. 系统提示词                ← 独立区块（智能体设定原始内容）
 *  3. 世界书注入·系统提示词后    ← 独立区块
 *  4. 记忆注入                  ← 独立区块
 *  5. 工具定义                  ← 独立区块（占用 prompt tokens）
 *  6. 世界书注入·对话开头        ← 独立区块
 *  7. 对话历史（前半段）         ← 第一个 BOTTOM/AT_DEPTH 之前
 *  8. 世界书注入·最新消息前/指定深度 ← 独立区块
 *  9. 对话历史（剩余部分）       ← 之后
 */
import { useMemo } from 'react';
import { CaretLeft, Sparkle, Wrench, DownloadSimple, User, Robot, ArrowLeft, BookOpenText } from '@phosphor-icons/react';
import { useChatStore } from '../store/chat-store';
import { useSettingsStore } from '../../../store/settings-store';
import { useLorebookStore } from '../../../apps/lorebook/store/lorebook-store';
import { runPipeline } from '../../../services/transformer-pipeline/index';
import { collectInjections } from '../../../services/transformer-pipeline/prompt-injection';
import { SEARCH_TOOL_DEFINITION } from '../../../services/search/index';
import type { LLMMessage } from '../../../services/llm/types';
import type { TransformerContext } from '../../../services/transformer-pipeline/types';

interface Props { onBack: () => void; }

const POSITION_LABELS: Record<string, string> = {
  BEFORE_SYSTEM_PROMPT: '系统提示词前', AFTER_SYSTEM_PROMPT: '系统提示词后',
  TOP_OF_CHAT: '对话开头', BOTTOM_OF_CHAT: '最新消息前', AT_DEPTH: '指定深度',
};

function estimateTokens(text: string): number {
  let t = 0;
  for (const ch of text) { t += ch.charCodeAt(0) > 127 ? 2 : 1; }
  return Math.ceil(t / 4);
}

function HistoryMsgRow({ msg, isLastUser }: { msg: LLMMessage; isLastUser: boolean }) {
  const htc = msg.toolCalls && msg.toolCalls.length > 0;
  const itr = msg.role === 'tool';
  return (
    <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--app-border)', background: htc ? 'var(--app-secondary)' : itr ? '#f0f8f0' : 'transparent' }}>
      <div style={{ fontSize: 11, color: 'var(--app-text-secondary)', marginBottom: 2 }}>
        {htc ? <><Wrench size={14} /> LLM 调用了工具</>
          : itr ? <><DownloadSimple size={14} /> 工具返回结果</>
          : msg.role === 'user' ? <><User size={14} /> 用户</> : <><Robot size={14} /> 智能体</>}
        {isLastUser && <span style={{ color: 'var(--app-primary)', marginLeft: 4 }}><ArrowLeft size={14} weight="bold" /> 最新输入</span>}
      </div>
      {htc && msg.toolCalls!.map((tc) => (
        <div key={tc.id} style={{ fontSize: 12, fontFamily: 'monospace', margin: '2px 0' }}>
          <span style={{ fontWeight: 600 }}>{tc.function.name}</span>
          <span style={{ color: 'var(--app-text-secondary)' }}>({tc.function.arguments})</span>
        </div>
      ))}
      {itr && <pre className="context-block__content" style={{ padding: 0, fontSize: 12, maxHeight: 80, overflow: 'hidden' }}>{msg.content}</pre>}
      {!htc && !itr && <pre className="context-block__content" style={{ padding: 0, fontSize: 12 }}>{msg.content}</pre>}
    </div>
  );
}

function InjView({ inj }: { inj: { content: string; position: string; role: string; sourceBook: string; sourceEntry: string } }) {
  return (
    <div style={{ padding: '8px 12px', margin: '4px 8px', border: '1px dashed var(--app-primary)', borderRadius: 8, background: '#fff8f0' }}>
      <div style={{ fontSize: 11, color: 'var(--app-primary)', marginBottom: 4, fontWeight: 600 }}>
        <BookOpenText size={12} /> 世界书注入 · {POSITION_LABELS[inj.position] || inj.position}
        <span style={{ fontWeight: 400, color: 'var(--app-text-secondary)', marginLeft: 6 }}>
          {inj.role === 'assistant' ? 'AI 角色' : '用户角色'} · {inj.sourceBook} → {inj.sourceEntry}
        </span>
      </div>
      <pre className="context-block__content" style={{ padding: 0, fontSize: 12 }}>{inj.content}</pre>
    </div>
  );
}

export default function ContextPreviewPage({ onBack }: Props) {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const storeMessages = useChatStore((s) => activeConversationId ? s.messages[activeConversationId] : undefined);
  const rawMessages = useMemo(() => {
    if (!storeMessages || !activeConversationId) return [];
    return useChatStore.getState().getCurrentMessages(activeConversationId);
  }, [storeMessages, activeConversationId]);
  const messages = rawMessages ?? [];
  const conversations = useChatStore((s) => s.conversations);
  const agents = useChatStore((s) => s.agents);
  const mcpServers = useSettingsStore((s) => s.mcpServers);
  const conv = conversations.find((c) => c.id === activeConversationId);
  const agent = agents.find((a) => a.id === conv?.agentId);
  const displayConfig = agent?.displayConfig;

  const ctx: TransformerContext = useMemo(() => {
    const boundBookIds = agent?.settings?.worldBookIds ?? [];
    const allLorebooks = useLorebookStore.getState().lorebooks;
    return { agent, memories: agent?.id ? (useChatStore.getState().memories[agent.id] ?? []) : [], displayConfig, mcpServers, searchProviders: {}, lorebooks: allLorebooks.filter((b) => boundBookIds.includes(b.id)) };
  }, [agent, displayConfig, mcpServers]);
  const allMems = agent?.id ? (useChatStore.getState().memories[agent.id] ?? []) : [];
  const baseMessages: LLMMessage[] = useMemo(() => messages.map((m) =>
    m.role === 'tool' ? { role: 'tool' as const, content: m.content, toolCallId: m.toolCallId } : { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content, toolCalls: m.toolCalls as any }
  ), [messages]);
  const processedMessages = useMemo(() => runPipeline(baseMessages, ctx), [baseMessages, ctx]);
  const injections = useMemo(() => collectInjections(baseMessages, ctx), [baseMessages, ctx]);
  const wbBefore = injections.filter((i) => i.position === 'BEFORE_SYSTEM_PROMPT');
  const wbAfter = injections.filter((i) => i.position === 'AFTER_SYSTEM_PROMPT');
  const wbInserted = injections.filter((i) => ['TOP_OF_CHAT', 'BOTTOM_OF_CHAT', 'AT_DEPTH'].includes(i.position));

  // 构建段 + 注入数据
  const { historyMsgs, topInj, bottomInj, splitAt } = useMemo(() => {
    const nonSys = processedMessages.filter((m) => m.role !== 'system');
    const msgs: LLMMessage[] = [];
    const tops: Array<{ content: string; position: string; role: string; sourceBook: string; sourceEntry: string }> = [];
    const bots: typeof tops = [];

    for (const msg of nonSys) {
      const m = wbInserted.find((i) => i.content === msg.content);
      if (m) {
        const d = { content: m.content, position: m.position, role: m.role, sourceBook: m.sourceBook, sourceEntry: m.sourceEntry };
        if (m.position === 'TOP_OF_CHAT') tops.push(d);
        else bots.push(d);
      } else {
        msgs.push(msg);
      }
    }
    // splitAt = msgs 中第几个 msg 之前插入第一个 BOTTOM/AT_DEPTH
    let splitIdx = -1;
    if (bots.length > 0) {
      // 在 processedMessages 中找到第一个 BOTTOM/AT_DEPTH 的位置
      let msgCount = 0;
      for (const pm of nonSys) {
        const isBot = wbInserted.some((i) => i.content === pm.content && i.position !== 'TOP_OF_CHAT');
        if (isBot) { splitIdx = msgCount; break; }
        const isNonInj = !wbInserted.some((i) => i.content === pm.content);
        if (isNonInj) msgCount++;
      }
    }

    return { historyMsgs: msgs, topInj: tops, bottomInj: bots, splitAt: splitIdx };
  }, [processedMessages, wbInserted]);

  const historyBefore = splitAt < 0 ? historyMsgs : historyMsgs.slice(0, splitAt);
  const historyAfter = splitAt < 0 ? [] : historyMsgs.slice(splitAt);

  const toolDefs = useMemo(() => {
    const d: Array<{ name: string; description: string; source: string }> = [];
    if (displayConfig?.enabledSearchProviders?.length) d.push({ name: SEARCH_TOOL_DEFINITION.function.name, description: SEARCH_TOOL_DEFINITION.function.description, source: '搜索' });
    for (const sid of displayConfig?.enabledMCPServerIds ?? []) {
      const s = mcpServers.find((sv) => sv.id === sid);
      if (!s || !s.enabled || s.status !== 'connected') continue;
      for (const t of s.discoveredTools ?? []) {
        if (!t.enabled) continue;
        d.push({ name: `mcp__${s.name}__${t.name}`, description: t.description || '', source: `MCP · ${s.name}` });
      }
    }
    return d;
  }, [displayConfig, mcpServers]);

  const tdTokens = toolDefs.reduce((s, td) => s + estimateTokens(td.name + td.description), 0);
  const sysTok = processedMessages.filter((m) => m.role === 'system').reduce((s, m) => s + estimateTokens(m.content), 0);
  const histTok = historyMsgs.reduce((s, m) => s + estimateTokens(m.content), 0);
  const totalTk = sysTok + histTok + tdTokens;

  const lastUserIdx = (() => {
    const pool = splitAt < 0 ? historyMsgs : historyAfter;
    for (let i = pool.length - 1; i >= 0; i--) { if (pool[i].role === 'user') return i; }
    return -1;
  })();

  const renderHist = (msgs: LLMMessage[], luIdx: number) => (
    <div style={{ padding: '4px 0' }}>
      {msgs.map((msg, idx) => (<HistoryMsgRow key={`h-${idx}`} msg={msg} isLastUser={idx === luIdx && msg.role === 'user'} />))}
    </div>
  );

  return (
    <div className="func-fullpage">
      <div className="func-fullpage__header">
        <button className="back-btn" onClick={onBack}><CaretLeft size={18} /> 返回</button><h1>上下文拼装</h1>
      </div>
      <div className="func-fullpage__body">
        <div className="context-summary">
          <span>预估总 tokens ≈ {totalTk}（本地粗略估算）</span>
          <span className="context-summary__detail">系统 {sysTok} · 历史 {histTok}{toolDefs.length > 0 ? ` · 工具定义 ≈ ${tdTokens}` : ''}{allMems.length > 0 ? ` · ${allMems.length} 条记忆` : ''}</span>
        </div>

        {/* 1: 世界书注入·系统提示词前（合并） */}
        {wbBefore.length > 0 && (
          <details className="context-block">
            <summary className="context-block__header">
              <span className="context-block__tag" style={{ background: '#e8a87c', color: '#fff' }}><BookOpenText size={12} /> 世界书注入·系统提示词前</span>
              <span className="context-block__tokens">{wbBefore.length} 条 · ≈ {wbBefore.reduce((s: number, i: any) => s + estimateTokens(i.content), 0)} tokens</span>
            </summary>
            {wbBefore.map((inj: any) => (
              <div key={inj.id} style={{ padding: '8px 12px', borderBottom: '1px solid var(--app-border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--app-primary)' }}>{inj.sourceBook} → {inj.sourceEntry}</div>
                <pre className="context-block__content" style={{ marginTop: 4 }}>{inj.content}</pre>
              </div>
            ))}
          </details>
        )}

        {/* 2: 系统提示词 */}
        <details className="context-block">
          <summary className="context-block__header">
            <span className="context-block__tag context-block__tag--static">系统提示词</span>
            <span className="context-block__tokens">≈ {estimateTokens(agent?.settings.systemPrompt || '')} tokens</span>
          </summary>
          <pre className="context-block__content">{agent?.settings.systemPrompt || '（空）'}</pre>
        </details>

        {/* 3: 世界书注入·系统提示词后（合并） */}
        {wbAfter.length > 0 && (
          <details className="context-block">
            <summary className="context-block__header">
              <span className="context-block__tag" style={{ background: '#e8a87c', color: '#fff' }}><BookOpenText size={12} /> 世界书注入·系统提示词后</span>
              <span className="context-block__tokens">{wbAfter.length} 条 · ≈ {wbAfter.reduce((s: number, i: any) => s + estimateTokens(i.content), 0)} tokens</span>
            </summary>
            {wbAfter.map((inj: any) => (
              <div key={inj.id} style={{ padding: '8px 12px', borderBottom: '1px solid var(--app-border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--app-primary)' }}>{inj.sourceBook} → {inj.sourceEntry}</div>
                <pre className="context-block__content" style={{ marginTop: 4 }}>{inj.content}</pre>
              </div>
            ))}
          </details>
        )}

        {/* 4: 记忆注入 */}
        {allMems.length > 0 && (
          <details className="context-block">
            <summary className="context-block__header">
              <span className="context-block__tag context-block__tag--memory">记忆注入</span>
              <span className="context-block__tokens">{allMems.length} 条 · ≈ {estimateTokens(allMems.map((m: any) => m.content).join('\n'))} tokens</span>
            </summary>
            <pre className="context-block__content">{allMems.map((m: any) => `- ${m.content}`).join('\n')}</pre>
          </details>
        )}

        {/* 5: 工具定义（按来源分类） */}
        {toolDefs.length > 0 && (
          <details className="context-block">
            <summary className="context-block__header">
              <span className="context-block__tag context-block__tag--tool">工具定义 <Sparkle size={14} weight="fill" /></span>
              <span className="context-block__tokens">{toolDefs.length} 个 · ≈ {tdTokens} tokens（占用 prompt）</span>
            </summary>
            {(() => {
              const groups: Record<string, typeof toolDefs> = {};
              for (const td of toolDefs) {
                const key = td.source.startsWith('MCP') ? 'MCP 工具' : td.source.startsWith('搜索') ? '网络搜索' : '本地工具';
                if (!groups[key]) groups[key] = [];
                groups[key].push(td);
              }
              return Object.entries(groups).map(([cat, items]) => (
                <details key={cat} style={{ margin: '4px 0' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 500, fontSize: 12, padding: '4px 8px', background: 'var(--app-secondary)' }}>
                    {cat}（{items.length}）
                  </summary>
                  <div style={{ padding: '4px 0' }}>
                    {items.map((td) => (
                      <div key={td.name} style={{ padding: '6px 12px', borderBottom: '1px solid var(--app-border)', fontSize: 13 }}>
                        <div style={{ fontWeight: 600, fontFamily: 'monospace', marginBottom: 2 }}><Wrench size={14} /> {td.name}</div>
                        <div style={{ color: 'var(--app-text-secondary)', fontSize: 12 }}>{td.description}</div>
                      </div>
                    ))}
                  </div>
                </details>
              ));
            })()}
          </details>
        )}

        {/* 6: 世界书注入·对话开头（合并） */}
        {topInj.length > 0 && (
          <details className="context-block">
            <summary className="context-block__header">
              <span className="context-block__tag" style={{ background: '#e8a87c', color: '#fff' }}><BookOpenText size={12} /> 世界书注入·对话开头</span>
              <span className="context-block__tokens">{topInj.length} 条</span>
            </summary>
            {topInj.map((d: any, i: number) => <InjView key={`top-${i}`} inj={d} />)}
          </details>
        )}

        {/* 7: 对话历史（前半段） */}
        {historyBefore.length > 0 && (
          <details className="context-block">
            <summary className="context-block__header">
              <span className="context-block__tag context-block__tag--dynamic">对话历史{splitAt >= 0 ? '（前半段）' : ''}</span>
              <span className="context-block__tokens">≈ {historyBefore.reduce((s, m) => s + estimateTokens(m.content), 0)} tokens · {historyBefore.length} 条</span>
            </summary>
            {renderHist(historyBefore, splitAt >= 0 ? -1 : lastUserIdx)}
          </details>
        )}

        {/* 8: 世界书注入·最新消息前/指定深度（合并） */}
        {bottomInj.length > 0 && (
          <details className="context-block">
            <summary className="context-block__header">
              <span className="context-block__tag" style={{ background: '#e8a87c', color: '#fff' }}><BookOpenText size={12} /> 世界书注入·注入消息</span>
              <span className="context-block__tokens">{bottomInj.length} 条</span>
            </summary>
            {bottomInj.map((d: any, i: number) => <InjView key={`bot-${i}`} inj={d} />)}
          </details>
        )}

        {/* 9: 对话历史（剩余部分） */}
        {historyAfter.length > 0 && (
          <details className="context-block">
            <summary className="context-block__header">
              <span className="context-block__tag context-block__tag--dynamic">对话历史（剩余部分）</span>
              <span className="context-block__tokens">≈ {historyAfter.reduce((s, m) => s + estimateTokens(m.content), 0)} tokens · {historyAfter.length} 条</span>
            </summary>
            {renderHist(historyAfter, lastUserIdx)}
          </details>
        )}
      </div>
    </div>
  );
}
