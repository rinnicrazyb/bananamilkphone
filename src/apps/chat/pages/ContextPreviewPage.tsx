// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { useChatStore } from '../store/chat-store';

interface ContextPreviewPageProps {
  onBack: () => void;
}

export default function ContextPreviewPage({ onBack }: ContextPreviewPageProps) {
  const activeConversationId = useChatStore((s: any) => s.activeConversationId);
  const rawMessages = useChatStore((s: any) =>
    activeConversationId ? s.messages[activeConversationId] : undefined
  );
  const messages = rawMessages ?? [];
  const conversations = useChatStore((s: any) => s.conversations);
  const agents = useChatStore((s: any) => s.agents);

  const conv = conversations.find((c: any) => c.id === activeConversationId);
  const agent = agents.find((a: any) => a.id === conv?.agentId);

  const estimateTokens = (text: string) => {
    let t = 0;
    for (const ch of text) {
      t += ch.charCodeAt(0) > 127 ? 2 : 1;
    }
    return Math.ceil(t / 4);
  };

  const systemTokens = agent?.settings.systemPrompt ? estimateTokens(agent.settings.systemPrompt) : 0;
  const totalTokens = messages.reduce((sum: number, m: any) => sum + estimateTokens(m.content), 0);

  return (
    <div className="func-fullpage">
      <div className="func-fullpage__header">
        <button className="back-btn" onClick={onBack}>← 返回</button>
        <h1>上下文拼装</h1>
      </div>
      <div className="func-fullpage__body">
        <div className="context-summary">
          <span>预估总 tokens：{systemTokens + totalTokens}</span>
          <span className="context-summary__detail">
            系统提示词 ≈ {systemTokens} tokens · 对话历史 ≈ {totalTokens} tokens
          </span>
        </div>

        {agent?.settings.systemPrompt && (
          <div className="context-block">
            <div className="context-block__header">
              <span className="context-block__tag context-block__tag--static">静态 · 系统提示词</span>
              <span className="context-block__tokens">≈ {systemTokens} tokens</span>
            </div>
            <pre className="context-block__content">{agent.settings.systemPrompt}</pre>
          </div>
        )}

        {messages.map((msg: any, i: number) => (
          <div key={msg.id} className="context-block">
            <div className="context-block__header">
              <span className={`context-block__tag ${i === messages.length - 1 ? 'context-block__tag--dynamic' : 'context-block__tag--history'}`}>
                {i === messages.length - 1 ? '动态 · 最新输入' : `历史 · 第${i + 1}条`}
              </span>
              <span className="context-block__tokens">≈ {estimateTokens(msg.content)} tokens</span>
            </div>
            <pre className="context-block__content">{msg.content}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
