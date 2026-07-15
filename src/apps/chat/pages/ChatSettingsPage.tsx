// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { useChatStore } from '../store/chat-store';

interface ChatSettingsPageProps {
  onBack: () => void;
}

export default function ChatSettingsPage({ onBack }: ChatSettingsPageProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const thinkingCollapsed = useChatStore((s: any) => s.thinkingChainCollapsed);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setThinkingChainCollapsed = useChatStore((s: any) => s.setThinkingChainCollapsed);

  return (
    <div className="func-fullpage">
      <div className="func-fullpage__header">
        <button className="back-btn" onClick={onBack}>← 返回</button>
        <h1>聊天设置</h1>
      </div>
      <div className="func-fullpage__body">
        <label className="settings-field settings-field--row">
          <span>自动折叠思考链</span>
          <input
            type="checkbox"
            checked={thinkingCollapsed}
            onChange={(e) => setThinkingChainCollapsed(e.target.checked)}
          />
        </label>
        <p className="settings-field__hint">
          开启后思考链默认收起，可手动展开
        </p>
        <div className="settings-field">
          <span>Tool Call 工具列表</span>
          <p className="settings-field__hint">（后续版本支持）</p>
        </div>
      </div>
    </div>
  );
}
