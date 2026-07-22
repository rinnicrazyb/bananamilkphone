/**
 * 交互式 HTML 渲染器 — iframe 沙盒
 *
 * 高度控制使用 ref 直接操作 DOM（不走 React state），避免 feedback loop：
 *   iframe postMessage → setState → re-render → iframe 高度变 → ResizeObserver → postMessage → ...
 *
 * 参考 TauriTavern html-code-preview.js
 */
import { useRef, useEffect, useCallback } from 'react';

const PREVIEW_HEIGHT_FALLBACK = 220;
const PREVIEW_MAX_HEIGHT = 2000; // 防止恶性 HTML 撑爆页面
const PREVIEW_MESSAGE_TYPE = 'bananamilk_html_preview_height';
let previewCounter = 0;

interface InteractiveHTMLProps {
  html: string;
  theme?: 'light' | 'dark';
}

function buildSrcdoc(html: string, theme: string): string {
  const isComplete = /<!doctype\b/i.test(html) || /<\s*html[\s>]/i.test(html);
  if (isComplete) return html;

  return [
    '<!DOCTYPE html>',
    '<html data-theme="' + theme + '">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<style>',
    '* { margin: 0; padding: 0; box-sizing: border-box; }',
    'body { font-family: system-ui, sans-serif; color: ' + (theme === 'dark' ? '#e0e0e0' : '#1f1f1f') + '; background: transparent; padding: 8px; }',
    'a { color: ' + (theme === 'dark' ? '#6ea8fe' : '#1a73e8') + '; }',
    'img { max-width: 100%; border-radius: 8px; }',
    '</style></head>',
    '<body>' + html + '</body></html>',
  ].join('\n');
}

function createHeightReporter(previewId: string): string {
  return [
    '<script>',
    '(function(){',
    'var MT=' + JSON.stringify(PREVIEW_MESSAGE_TYPE) + ',PID=' + JSON.stringify(previewId) + ';',
    'function gh(){',
    '  var r=document.documentElement,b=document.body;',
    '  return Math.max(r?r.scrollHeight:0,r?r.offsetHeight:0,b?b.scrollHeight:0,b?b.offsetHeight:0,b?b.clientHeight:0);',
    '}',
    'function ph(){ try{ parent.postMessage({type:MT,previewId:PID,height:gh()},"*"); }catch(e){} }',
    'function sc(){ requestAnimationFrame(ph); }',
    'if(typeof ResizeObserver==="function"){ var ro=new ResizeObserver(sc); if(document.documentElement) ro.observe(document.documentElement); if(document.body) ro.observe(document.body); }',
    'if(typeof MutationObserver==="function"){ var mo=new MutationObserver(sc); mo.observe(document.documentElement||document,{subtree:true,childList:true,attributes:true,characterData:true}); }',
    'window.addEventListener("load",function(){ ph(); setTimeout(ph,50); setTimeout(ph,250); setTimeout(ph,1000); });',
    'window.addEventListener("resize",ph);',
    'ph();',
    '})();',
    '</script>',
  ].join('');
}

function injectHeightReporter(srcdoc: string, previewId: string): string {
  const reporter = createHeightReporter(previewId);
  if (/<\/body\s*>/i.test(srcdoc)) return srcdoc.replace(/<\/body\s*>/i, reporter + '</body>');
  return srcdoc + '\n' + reporter;
}

export default function InteractiveHTML({ html, theme = 'light' }: InteractiveHTMLProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const heightRef = useRef(PREVIEW_HEIGHT_FALLBACK); // ref 存当前高度，不触发 re-render
  const previewIdRef = useRef<string>('');

  if (!previewIdRef.current) {
    previewCounter += 1;
    previewIdRef.current = 'html-preview-' + Date.now() + '-' + previewCounter;
  }

  // 直接操作 DOM 更新 iframe 高度（不走 React state，消除 feedback loop）
  const updateHeight = useCallback((h: number) => {
    const clamped = Math.max(PREVIEW_HEIGHT_FALLBACK, Math.min(Math.ceil(h), PREVIEW_MAX_HEIGHT));
    if (clamped !== heightRef.current) {
      heightRef.current = clamped;
      const iframe = iframeRef.current;
      if (iframe) iframe.style.height = clamped + 'px';
    }
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    const data = event.data;
    if (!data || data.type !== PREVIEW_MESSAGE_TYPE || data.previewId !== previewIdRef.current) return;
    const h = Number(data.height);
    if (Number.isFinite(h)) updateHeight(h);
  }, [updateHeight]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // srcdoc 更新时重置高度
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    updateHeight(PREVIEW_HEIGHT_FALLBACK);
    const srcdoc = injectHeightReporter(buildSrcdoc(html, theme), previewIdRef.current);
    iframe.srcdoc = srcdoc;
  }, [html, theme, updateHeight]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts allow-forms allow-modals"
      referrerPolicy="no-referrer"
      title="interactive-content"
      style={{
        width: '100%',
        height: PREVIEW_HEIGHT_FALLBACK, // 初始高度，后续由 ref 直接操作 DOM 更新
        border: 'none',
        background: 'transparent',
      }}
    />
  );
}
