/**
 * hljs 语法高亮 + 复制按钮服务
 * 参考 TauriTavern code-highlight-coordinator.js
 */
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css'; // 浅色主题（匹配整体风格）

/** 对代码块执行语法高亮，返回 innerHTML */
export function highlightCode(code: string, language?: string): string {
  if (!language || language === 'plaintext' || language === 'text') {
    return hljs.highlightAuto(code).value;
  }
  try {
    return hljs.highlight(code, { language }).value;
  } catch {
    return hljs.highlightAuto(code).value;
  }
}
