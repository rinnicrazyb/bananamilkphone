/**
 * 交互式 HTML 渲染器 — iframe 沙盒
 *
 * 用于渲染 AI 输出的交互式 HTML 内容（HTML 网页、脚本、小游戏等）
 * sandbox 属性阻止访问父页面数据
 *
 * 高度自适应策略（参考 TauriTavern）：
 * 1. ResizeObserver 观测 body/html 尺寸变化
 * 2. MutationObserver 兜底 DOM 结构变化
 * 3. 注入 postMessage 高度报告脚本（iframe 内主动汇报）
 * 4. load 事件后多阶段 setTimeout 确保最终高度正确
 * 5. 最小高度 220px
 */
import { useRef, useEffect, useCallback, useState } from 'react';

const PREVIEW_HEIGHT_FALLBACK = 220;
const PREVIEW_MESSAGE_TYPE = 'bananamilk_html_preview_height';
let previewCounter = 0;

interface InteractiveHTMLProps {
  html: string;
  /** 亮/暗色模式 */
  theme?: 'light' | 'dark';
}

/**
 * 构建 iframe srcdoc：如果内容不是完整 HTML 文档，自动包裹骨架
 */
function buildSrcdoc(html: string, theme: string): string {
  const isComplete = /<!doctype\b/i.test(html) || /<\s*html[\s>]/i.test(html);
  if (isComplete) return html;

  return [
    '<!DOCTYPE html>',
    '<html data-theme="' + theme + '">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<style>',
    '* { margin: 0; padding: 0; box-sizing: border-box; }',
    'body {',
    '  font-family: system-ui, -apple-system, sans-serif;',
    '  color: ' + (theme === 'dark' ? '#e0e0e0' : '#1f1f1f') + ';',
    '  background: transparent;',
    '  padding: 8px;',
    '}',
    'a { color: ' + (theme === 'dark' ? '#6ea8fe' : '#1a73e8') + '; }',
    'img { max-width: 100%; border-radius: 8px; }',
    '</style>',
    '</head>',
    '<body>' + html + '</body>',
    '</html>',
  ].join('\n');
}

/**
 * 创建高度报告脚本，注入到 iframe srcdoc 中
 */
function createHeightReporter(previewId: string): string {
  return [
    '<script>',
    '(function(){',
    'var MESSAGE_TYPE = ' + JSON.stringify(PREVIEW_MESSAGE_TYPE) + ';',
    'var PREVIEW_ID = ' + JSON.stringify(previewId) + ';',
    'function getHeight(){',
    '  var root=document.documentElement;',
    '  var body=document.body;',
    '  return Math.max(',
    '    root?root.scrollHeight:0,',
    '    root?root.offsetHeight:0,',
    '    body?body.scrollHeight:0,',
    '    body?body.offsetHeight:0,',
    '    body?body.clientHeight:0',
    '  );',
    '}',
    'function postHeight(){',
    '  try{ parent.postMessage({ type: MESSAGE_TYPE, previewId: PREVIEW_ID, height: getHeight() }, "*"); }catch(e){}',
    '}',
    'function schedule(){ requestAnimationFrame(postHeight); }',
    'if(typeof ResizeObserver==="function"){',
    '  var ro=new ResizeObserver(schedule);',
    '  if(document.documentElement) ro.observe(document.documentElement);',
    '  if(document.body) ro.observe(document.body);',
    '}',
    'if(typeof MutationObserver==="function"){',
    '  var mo=new MutationObserver(schedule);',
    '  mo.observe(document.documentElement||document,{subtree:true,childList:true,attributes:true,characterData:true});',
    '}',
    'window.addEventListener("load",function(){',
    '  postHeight();',
    '  setTimeout(postHeight,50);',
    '  setTimeout(postHeight,250);',
    '  setTimeout(postHeight,1000);',
    '});',
    'window.addEventListener("resize",postHeight);',
    'postHeight();',
    '})();',
    '</script>',
  ].join('');
}

/**
 * 将高度报告脚本注入 srcdoc 的 </body> 前
 */
function injectHeightReporter(srcdoc: string, previewId: string): string {
  const reporter = createHeightReporter(previewId);
  if (/<\/body\s*>/i.test(srcdoc)) {
    return srcdoc.replace(/<\/body\s*>/i, reporter + '</body>');
  }
  return srcdoc + '\n' + reporter;
}

export default function InteractiveHTML({ html, theme = 'light' }: InteractiveHTMLProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(PREVIEW_HEIGHT_FALLBACK);
  const previewIdRef = useRef<string>('');

  // 每个实例生成唯一 previewId
  if (!previewIdRef.current) {
    previewCounter += 1;
    previewIdRef.current = 'html-preview-' + Date.now() + '-' + previewCounter;
  }

  // postMessage 监听 — 处理 iframe 内部主动汇报的高度（按 previewId 过滤）
  const handleMessage = useCallback((event: MessageEvent) => {
    const data = event.data;
    if (!data || data.type !== PREVIEW_MESSAGE_TYPE || data.previewId !== previewIdRef.current) return;
    const h = Number(data.height);
    if (!Number.isFinite(h)) return;
    setHeight((prev) => Math.max(prev, Math.ceil(h)));
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // 构建 srcdoc 并写入 iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    setHeight(PREVIEW_HEIGHT_FALLBACK);
    const srcdoc = injectHeightReporter(buildSrcdoc(html, theme), previewIdRef.current);
    iframe.srcdoc = srcdoc;
  }, [html, theme]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts allow-forms allow-modals"
      referrerPolicy="no-referrer"
      title="interactive-content"
      style={{
        width: '100%',
        height: Math.max(height, PREVIEW_HEIGHT_FALLBACK),
        border: 'none',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    />
  );
}
