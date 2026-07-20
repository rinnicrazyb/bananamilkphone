# TauriTavern 代码/HTML 渲染技术学习笔记

> 基于 TauriTavern-docs-refresh 仓库（`C:\refs\TauriTavern-docs-refresh`）的源码分析。
> 学习日期：2026-07-18
> 目的：对照 TauriTavern 的代码渲染技术，找出香蕉牛奶机的不足，解决"HTML 网页在聊天界面被气泡包裹/无法直接渲染"的问题。

---

## 目录

1. [核心架构：两阶段渲染](#1-核心架构两阶段渲染)
2. [Phase 1：消息格式渲染（messageFormatting）](#2-phase-1消息格式渲染messageformatting)
3. [Phase 2：代码块后处理（renderInteractiveHtmlCodeBlocks）](#3-phase-2代码块后处理renderinteractivehtmlcodeblocks)
4. [HTML 检测策略（isInteractiveHtmlSnippet）](#4-html-检测策略isinteractivehtmlsnippet)
5. [iframe 沙盒预览实现](#5-iframe-沙盒预览实现)
6. [动态高度自适应（postMessage + ResizeObserver）](#6-动态高度自适应postmessage--resizeobserver)
7. [扩展/收缩功能（Preview to Last Message）](#7-扩展收缩功能preview-to-last-message)
8. [安全机制（DOMPurify + sandbox + CSP）](#8-安全机制dompurify--sandbox--csp)
9. [第三方渲染器委派（JSR / LWB 兼容）](#9-第三方渲染器委派jsr--lwb-兼容)
10. [嵌入式运行时（Embedded Runtime）生命周期管控](#10-嵌入式运行时embedded-runtime生命周期管控)
11. [与香蕉牛奶机的完整对比分析](#11-与香蕉牛奶机的完整对比分析)
12. [香蕉牛奶机的改进方案](#12-香蕉牛奶机的改进方案)

---

## 1. 核心架构：两阶段渲染

TauriTavern 的代码渲染不是"一步到位"的——它分为两个独立的阶段：

```
Phase 1 (消息渲染时):
  原始消息文本
    ↓ messageFormatting() — markdown 解析 + DOMPurify 消毒
    ↓ 写入 .mes_text div 的 innerHTML
  → 所有内容(含 HTML 代码块)都以 <pre><code> 形式呈现

Phase 2 (消息渲染后):
  DOM 已就绪
    ↓ addCopyToCodeBlocks() 被调用
    ↓ renderInteractiveHtmlCodeBlocks()
    ↓ 扫描 <pre><code> 中的文本内容
    ↓ 检测是否含 <html> / <!doctype> / <script>
    ↓ 符合条件的 <pre> 被替换为 iframe 预览容器
  → HTML/脚本代码块变成可交互预览
```

**关键设计理念**：渲染管线不关心"这是不是HTML"——它把一切当作规范 markdown 处理。代码渲染是 DOM 后处理步骤，不干预渲染管线的正常流程。这样做的优点是：
- 不破坏 markdown 渲染器的正常逻辑
- 保留普通代码块的语法高亮
- 用户可以随时开关代码渲染功能，不影响消息本身的展示

---

## 2. Phase 1：消息格式渲染（messageFormatting）

**文件：`src/script.js` 第 2372 行，函数 `messageFormatting()`**

这个函数负责将消息原始文本转换为 HTML，主要流程：

1. **参数替换**：`substituteParams()` 替换角色名/用户名的占位符
2. **正则处理**：`getRegexedString()` 应用用户自定义的正则替换规则
3. **Markdown 修正**：`fixMarkdown()` 自动修复生成式 Markdown 的常见问题
4. **HTML 编码**：可选对 `<` `>` 进行编码（`encode_tags` 设置）
5. **引号保护**：保护双引号不被后续 HTML 转义破坏
6. **Showdown 解析**：核心 markdown → HTML 转换（使用 Showdown.js 库）
7. **DOMPurify 消毒**：最后的 HTML 安全过滤

**关键点**：整个流程中，HTML 代码块（如 ````html <html>...</html> ````）被当做普通 markdown 代码块处理，呈现为 `<pre><code>` 元素。Showdown.js 对代码块内容原样保留，不会解析其中的 HTML。

---

## 3. Phase 2：代码块后处理（renderInteractiveHtmlCodeBlocks）

**文件：`src/scripts/html-code-preview.js`**

这是代码渲染的核心文件，包含完整的交互式 HTML 预览系统。

### 调用时机

```javascript
// src/script.js 第 3022 行 — addCopyToCodeBlocks 函数中
export function addCopyToCodeBlocks(messageElement) {
    const shouldRunHtmlCodeRender = extension_settings.code_render?.enabled === true;
    setHtmlCodeRenderEnabled(shouldRunHtmlCodeRender);
    setHtmlCodeRenderReplaceLastMessageByDefault(
        extension_settings.code_render?.replace_last_message_by_default === true
    );
    setHtmlCodeRenderSuppressedByExternalRenderer(
        shouldRunHtmlCodeRender && isCodeRenderDelegatedToThirdPartyRenderer()
    );
    renderInteractiveHtmlCodeBlocks(messageElement);
    // ... 之后还有代码高亮和复制按钮的处理
}
```

`addCopyToCodeBlocks()` 在每次消息渲染完成后被调用。

### 核心扫描逻辑

```javascript
export function renderInteractiveHtmlCodeBlocks(messageElement) {
    if (!htmlCodeRenderEnabled || htmlCodeRenderSuppressedByExternalRenderer) {
        return; // 被禁用或被第三方渲染器接管时直接退出
    }

    bindPreviewMessageListener();  // 绑定全局 postMessage 监听器
    cleanupPreviewFrames();        // 清理已断开的 iframe

    const codeBlocks = $root.find('pre > code');
    for (let i = 0; i < codeBlocks.length; i++) {
        const codeBlock = codeBlocks.get(i);
        const preBlock = codeBlock?.closest('pre');
        const sourceCode = codeBlock.textContent ?? '';

        if (!isInteractiveHtmlSnippet(sourceCode)) {
            continue;  // 不是交互式 HTML，跳过
        }

        const previewContainer = createPreviewContainer(sourceCode);
        preBlock.replaceWith(previewContainer);  // <pre> 被整个替换
    }
}
```

**替换机制**：`<pre>` 元素被完整的预览容器替换。如果代码块在 markdown 的 ```` ``` ```` 包裹中，整个 `<pre>` 被替换，不影响周围内容。

---

## 4. HTML 检测策略（isInteractiveHtmlSnippet）

**文件：`src/scripts/html-code-preview.js` 第 46 行**

```javascript
function isInteractiveHtmlSnippet(sourceCode) {
    if (!sourceCode || typeof sourceCode !== 'string') {
        return false;
    }

    return HTML_ROOT_PATTERN.test(sourceCode)     // /<\s*html[\s>]/i
        || DOCTYPE_PATTERN.test(sourceCode)        // /<!doctype\b/i
        || SCRIPT_PATTERN.test(sourceCode);        // /<\s*script\b/i
}
```

三个正则：
| 模式 | 正则 | 用途 |
|------|------|------|
| `HTML_ROOT_PATTERN` | `/<\s*html[\s>]/i` | 检测 `<html>` 标签（大小写不敏感，允许属性） |
| `DOCTYPE_PATTERN` | `/<!doctype\b/i` | 检测 `<!DOCTYPE html>` 声明 |
| `SCRIPT_PATTERN` | `/<\s*script\b/i` | 检测 `<script>` 标签 |

**检测范围**：只要内容中包含上述任意模式就认定为交互式 HTML。这与香蕉牛奶机的 `isFullHtmlPage()` 形成鲜明对比（见对比章节）。

### Source 补充机制

```javascript
function buildPreviewSource(sourceCode) {
    const source = sourceCode.trim();
    if (!source) return '';

    // 已经是完整文档 → 原样渲染
    if (DOCTYPE_PATTERN.test(source) || HTML_ROOT_PATTERN.test(source)) {
        return source;
    }

    // 纯 <script> 块 → 包装为最小 HTML 壳
    return [
        '<!DOCTYPE html>',
        '<html><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '</head><body>',
        source,
        '</body></html>',
    ].join('\n');
}
```

对于单独的 `<script>` 标签，自动补充完整的 HTML 骨架，确保 iframe 内正确运行。

---

## 5. iframe 沙盒预览实现

**文件：`src/scripts/html-code-preview.js`**，完整预览容器的创建流程：

### 5.1 预览容器结构

```html
<div class="mes-code-preview">
  <div class="mes-code-preview-frame-wrap">
    <iframe class="mes-code-preview-frame"
            sandbox="allow-scripts allow-forms allow-modals"
            srcdoc="..."
            loading="lazy">
    </iframe>
  </div>
  <button class="mes-code-preview-toggle">
    <i class="fa-solid fa-up-right-and-down-left-from-center"></i>
  </button>
</div>
```

### 5.2 iframe 创建

```javascript
function createPreviewIframe(srcdoc, previewId) {
    const iframe = document.createElement('iframe');
    iframe.className = PREVIEW_FRAME_CLASS;
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer';
    iframe.title = 'Interactive code preview';
    iframe.allowFullscreen = true;
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('allow', 'fullscreen');
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
    iframe.srcdoc = injectHeightReporter(srcdoc, previewId);
    iframe.style.height = `${PREVIEW_HEIGHT_FALLBACK}px`;  // 默认 220px
    return iframe;
}
```

**关键安全属性**：
- `sandbox="allow-scripts allow-forms allow-modals"` — 允许脚本执行但不允许：
  - `allow-same-origin` — 禁止访问父页面数据
  - `allow-top-navigation` — 禁止导航父页面
  - `allow-popups` — 禁止弹出窗口
- `referrerPolicy="no-referrer"` — 不发送 Referer 头
- `srcdoc` 属性 — 内容直接嵌入，不产生网络请求

### 5.3 为什么不使用 blob: URL

TauriTavern 使用 `srcdoc` 属性而不是 blob URL。原因（来自嵌入式运行时文档）：
- blob URL 在 iframe 被销毁后失效
- `srcdoc` 可以随时重新创建 iframe
- 软停车池(Parking Lot)复用 iframe 时不需要重建 URL

---

## 6. 动态高度自适应（postMessage + ResizeObserver）

这是 TauriTavern 实现中非常成熟的部分。

### 6.1 高度报告脚本注入

```javascript
function createHeightReporter(previewId) {
    return [
        '<script>',
        '(function(){',
        `const MESSAGE_TYPE = "${PREVIEW_MESSAGE_TYPE}";`,
        `const PREVIEW_ID = ${JSON.stringify(previewId)};`,
        'function getHeight(){',
        '  const root=document.documentElement;',
        '  const body=document.body;',
        '  return Math.max(',
        '    root?root.scrollHeight:0,',
        '    root?root.offsetHeight:0,',
        '    body?body.scrollHeight:0,',
        '    body?body.offsetHeight:0,',
        '    body?body.clientHeight:0',
        '  );',
        '}',
        'function postHeight(){',
        '  try{ parent.postMessage({ type: MESSAGE_TYPE, previewId: PREVIEW_ID, height: getHeight() }, "*"); }catch{}',
        '}',
        'const schedule=()=>requestAnimationFrame(postHeight);',
        'if(typeof ResizeObserver==="function"){',
        '  const ro=new ResizeObserver(schedule);',
        '  if(document.documentElement) ro.observe(document.documentElement);',
        '  if(document.body) ro.observe(document.body);',
        '}',
        'if(typeof MutationObserver==="function"){',
        '  const mo=new MutationObserver(schedule);',
        '  mo.observe(document.documentElement||document,{subtree:true,childList:true,attributes:true,characterData:true});',
        '}',
        'window.addEventListener("load",()=>{postHeight();setTimeout(postHeight,50);setTimeout(postHeight,250);setTimeout(postHeight,1000);});',
        'window.addEventListener("resize",postHeight);',
        'postHeight();',
        '})();',
        '</script>',
    ].join('');
}
```

**注入方式**：
```javascript
function injectHeightReporter(srcdoc, previewId) {
    const reporter = createHeightReporter(previewId);
    if (/<\/body\s*>/i.test(srcdoc)) {
        return srcdoc.replace(/<\/body\s*>/i, `${reporter}</body>`);
    }
    return `${srcdoc}\n${reporter}`;
}
```

### 6.2 父页面监听

```javascript
window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== PREVIEW_MESSAGE_TYPE || typeof data.previewId !== 'string') {
        return;
    }
    const iframe = previewFrames.get(data.previewId);
    if (!iframe || !iframe.isConnected) return;

    const height = Number(data.height);
    if (!Number.isFinite(height)) return;

    const nextHeight = Math.max(PREVIEW_HEIGHT_FALLBACK, Math.ceil(height));
    iframe.style.height = `${nextHeight}px`;
    // 同步调整父容器高度
    const frameWrap = iframe.parentElement;
    if (frameWrap instanceof HTMLElement) {
        frameWrap.style.height = `${nextHeight}px`;
        syncMessageTextHeight(frameWrap, nextHeight);
    }
});
```

**与香蕉牛奶机的对比**：
| 特性 | TauriTavern | 香蕉牛奶机 |
|------|-------------|-----------|
| 观测方式 | ResizeObserver + MutationObserver + load/resize 事件 | ResizeObserver 仅观测 body |
| 通信方式 | postMessage（iframe → parent） | ResizeObserver（直接在 iframe 内） |
| 高度计算 | 综合 scroll/offset/clientHeight | `doc.body.scrollHeight` |
| 兜底值 | 220px | 50px |
| 时延加载 | `loading="lazy"` + 多阶段 setTimeout | 无 |

---

## 7. 扩展/收缩功能（Preview to Last Message）

TauriTavern 有一个独特功能：代码预览可以"移动"到最新一条消息的位置，并替换其内容。

### 功能机制

```
点击展开按钮 → 预览容器从原始消息移动到最新消息
  → 原始消息处留下 hidden placeholder
  → 最新消息的原始内容被保存到 DocumentFragment
  → 预览容器显示在最新消息位置

点击收缩按钮 → 预览容器移回原始消息
  → placeholder 被移除
  → 最新消息的原始内容恢复
```

### 状态管理

使用 `WeakMap<HTMLElement, PreviewExpansionState>` 管理每个预览容器的展开状态：

```javascript
const previewExpansionStates = new WeakMap();

// PreviewExpansionState 结构
{
    expanded: boolean,
    toggleButton: HTMLButtonElement | null,
    sourceMessageText: HTMLElement | null,      // 原始消息
    sourceMessageMinHeight: string,
    sourcePlaceholder: HTMLElement | null,       // 占位元素
    targetMessageText: HTMLElement | null,       // 目标消息（最新消息）
    targetMessageMinHeight: string,
    targetContent: DocumentFragment | null,      // 保存的原始内容
}
```

**注意**：此功能为可选，需要用户开启 `replace_last_message_by_default` 设置。

---

## 8. 安全机制（DOMPurify + sandbox + CSP）

TauriTavern 采用多层安全机制：

### 第一层：消息渲染时的 DOMPurify
- `messageFormatting()` 最终输出经过 DOMPurify 过滤
- 默认不允许 `<style>` 和其他危险标签
- 系统消息可以通过 `uses_system_ui` 覆盖

### 第二层：iframe sandbox
- `sandbox="allow-scripts allow-forms allow-modals"`
- **不包含** `allow-same-origin` — 隔离父页面数据
- **不包含** `allow-top-navigation` — 防止导航
- **不包含** `allow-popups` — 防止弹出窗口

### 第三层：referrerPolicy
- `referrerPolicy="no-referrer"` — 不发送 Referer 头

### 第四层：嵌入式运行时的自愈机制
- iframe 被第三方意外删除时自动恢复（ER-3.2）
- 消息重渲染时保留 iframe 避免重建

---

## 9. 第三方渲染器委派（JSR / LWB 兼容）

TauriTavern 可以检测并委派给第三方代码渲染器：

```javascript
// src/scripts/extensions.js
export function isCodeRenderDelegatedToThirdPartyRenderer() {
    // 检测知名的第三方渲染器是否启用
    return findExtension('JS-Slash-Runner')?.enabled === true
        || findExtension('LittleWhiteBox')?.enabled === true;
}
```

当第三方渲染器启用时：
1. 内置代码渲染被抑制（`htmlCodeRenderSuppressedByExternalRenderer = true`）
2. 保留原始 `<pre><code>` 结构，不做 iframe 替换
3. 第三方渲染器可以接管代码块的渲染

**嵌入式运行时**（Embedded Runtime）进一步将第三方渲染器的 iframe 纳入生命周期管理：
- Budget（最大并行活动 iframe 数量）
- Park/Hydrate（离屏/超预算时软停车，回到视口时恢复）
- 消息重渲染保护（避免 iframe 被销毁重建）

---

## 10. 嵌入式运行时（Embedded Runtime）生命周期管控

**文档：`docs/CurrentState/EmbeddedRuntime.md`**

TauriTavern 的 Embedded Runtime（ER）是一个独立的消息内 iframe 管理子系统，由以下组件组成：

- **Manager**：全局资源预算与状态机（slot 状态：`cold | active | parked | disposed`）
- **Profiles**：`off | auto | compat | mobile-safe`，按设备能力决定预算
- **Managed iframe slot**：park/hydrate + 软停车池
- **Runtime detectors**：DOM 适配注册（JSR 的 `.TH-render` / LWB 的 `.xiaobaix-iframe-wrapper`）
- **Chat adapter**：事件驱动 + MutationObserver 兜底
- **渲染事务**（ER-3.0）：消息重渲染时保护现有 iframe 不被销毁

香蕉牛奶机由于使用 React 虚拟 DOM 渲染，天然避免了"直接 innerHTML 导致 iframe 销毁"的问题，但 React 的虚拟滚动（`@tanstack/react-virtual`）在回收 DOM 元素时也会销毁 iframe。这点需要关注。

---

## 11. 与香蕉牛奶机的完整对比分析

### 11.1 渲染管线对比

| 维度 | TauriTavern | 香蕉牛奶机（当前） |
|------|-------------|-------------------|
| **渲染引擎** | Showdown.js（Markdown→HTML）+ DOMPurify | react-markdown + rehype-raw + rehype-sanitize |
| **UI 框架** | DOM（jQuery 操作） | React 18 虚拟 DOM |
| **代码渲染时机** | 消息渲染后 DOM 后处理 | 消息渲染时 MarkdownRenderer 内决策 |
| **HTML 检测** | 检测 `<html>` / `<!doctype>` / `<script>` 出现在内容任意位置 | `isFullHtmlPage()` 要求内容以 `<!DOCTYPE html>` 或 `<html>` **开头** |
| **检测位置** | `<pre><code>` 内部的纯文本 | 原始消息文本 |
| **气泡控制** | 代码块原本就在 `<pre>` 中，预览直接替换 `<pre>`，不影响气泡逻辑 | 必须在渲染时决定"是否用气泡"，导致 HTML 可能被气泡包裹 |
| **预览 iframe** | `srcdoc` 嵌入完整 HTML | `doc.write()` 写入内容 |
| **高度适配** | postMessage + ResizeObserver + MutationObserver + 多阶段 setTimeout | 仅 ResizeObserver |
| **扩展功能** | 可移动到最新消息位置 | 无 |
| **设置项** | 开关 + replace-last-message-by-default | 无用户可见开关 |
| **第三方兼容** | JSR/LWB 委派 + ER 生命周期管控 | 无 |

### 11.2 核心问题：为什么 HTML 网页被气泡包裹

经分析，我方渲染流程存在以下问题：

**问题 1：`isFullHtmlPage()` 检测过于严格**

```typescript
// MessageRenderer.tsx 第 76-78 行
function isFullHtmlPage(text: string): boolean {
  return /^\s*<!DOCTYPE\s+html/i.test(text) || /^\s*<html[\s>]/i.test(text);
}
```

- 要求内容**以** `<!DOCTYPE html>` 或 `<html>` **开头**，只跳过前导空白
- 如果 AI 在 HTML 前加了任何其他文本（比如一句"这是我为你做的网页"），检测就失败
- 对比 TauriTavern：使用 `test()` 而不是 `match().index === 0`，匹配内容中**任何位置**

**问题 2：`renderSegmented` 中格式化内容走气泡的隐式路径**

在第 141-142 行：
```typescript
const isFormatted = hasMarkdownOrHtml(part.content);
const isInBubble = config.useBubbles && !isFormatted;
```
- 只有被判定为"非格式化文本"的内容才走气泡
- 对于格式化内容（含 HTML），走第 188 行的 `else` 分支
- 但第 189 行再次用 `isFullHtmlPage()` 检查：
  - 如果通过 → InteractiveHTML（无气泡 ✅）
  - 如果不通过 → MarkdownRenderer（``` 包裹的 HTML 代码块被渲染为 `<pre><code>`，通常无气泡 ✅）

**问题 3：`renderContinuous` 中气泡包裹的判断**

第 230 行：
```typescript
if (config.useBubbles && !hasFullHtmlPage) {
```
- `hasFullHtmlPage` 只在 `isFullHtmlPage()` 返回 true 时被设为 true
- 如果检测失败，所有内容（含 iframe）都被包裹在气泡 div 中

**问题 4：MarkdownRenderer 的 `isPureHtml()` 过于严格**

```typescript
function isPureHtml(text: string): boolean {
  if (!/<[a-z][\s\S]*?>/i.test(text)) return false;
  if (/^#{1,6}\s/m.test(text)) return false;  // 标题
  if (/\*\*|__|~~/.test(text)) return false;  // 粗体/下划线
  if (/```/.test(text)) return false;         // 代码块
  // ...更多检查
  return true;
}
```

- 只要文本中包含**任一** Markdown 语法特征，就不被认为是"纯 HTML"
- 如果一个 HTML 网页中碰巧包含 `**`、`##` 或 `[text](url)` 等，就会走 react-markdown 路径而非 InteractiveHTML
- react-markdown + rehype-raw 会将 HTML 作为 inline HTML 渲染，但如果遇到完整的 `<html>` 文档结构，可能渲染异常

### 11.3 TauriTavern 的优势做法

1. **后处理策略更稳健**：不做"这是 HTML 还是 Markdown"的预判，所有内容先按 markdown 渲染，再扫描 DOM 替换代码块
2. **检测逻辑更宽松**：内容中**任何位置**出现 `<html>` / `<!doctype>` / `<script>` 即触发
3. **Bubble 零冲突**：代码块在 DOM 中以 `<pre><code>` 存在，替换这个节点不会影响气泡结构
4. **可配置性**：用户可通过设置开关全局启用/禁用
5. **第三方兼容**：检测到 JSR/LWB 等渲染器时自动让路

---

## 12. 香蕉牛奶机的改进方案

基于以上分析，提出以下改进方向：

### 12.1 修复气泡包裹问题（立即修复）

**方案 A**：改善 `isFullHtmlPage()` 检测和气泡旁路逻辑

```typescript
// 改进检测：内容中任何位置出现 <html>/<!doctype>/<script> 即判定
function isInteractiveHtmlContent(text: string): boolean {
  return /<\s*html[\s>]/i.test(text) 
      || /<!doctype\b/i.test(text)
      || /<\s*script\b/i.test(text);
}
```

然后在气泡逻辑中增加检查：如果内容被判定为交互式 HTML，强制不走气泡。

**方案 B**：采用类似 TauriTavern 的后处理策略

在 MarkdownRenderer 渲染完成后，扫描生成的 DOM 中的 `<pre><code>` 节点，将其中的 HTML 代码块替换为 InteractiveHTML iframe。

**推荐：方案 A（轻量修复）+ 逐步引入方案 B 的部分思想**

### 12.2 增强高度自适应（改进）

参考 TauriTavern 的 postMessage 通信机制：
- 在 iframe 内注入高度报告脚本
- 使用 MutationObserver 兜底（当 DOM 结构变化时触发）
- 多阶段 setTimeout 确保 load 完成后正确报告高度
- 合理的最小高度（220px vs 当前的 50px）

### 12.3 安全增强（建议）

当前 `InteractiveHTML.tsx` 的 sandbox 属性已经包含 `allow-scripts allow-forms allow-modals`，与 TauriTavern 一致。可以补充：
- `referrerPolicy="no-referrer"` 
- `loading="lazy"`
- 更完善的 sandbox（当前已完整）

### 12.4 用户设置开关（可选项）

在聊天设置或设置 APP 中添加"HTML 代码渲染"开关，默认启用，用户可选择关闭（关闭后以纯文本代码块显示）。

---

## 总结

TauriTavern 的代码渲染架构核心思想是**两阶段渲染**：
1. 所有消息统一走 markdown 渲染
2. DOM 就绪后，扫描 `<pre><code>` 并将含 HTML/脚本的代码块替换为 iframe 预览

这一策略天然避免了"HTML 被气泡包裹"的问题，同时保留了代码块的语法高亮和用户的可配置性。

香蕉牛奶机需要在以下方面改进：
1. **`isFullHtmlPage()` 检测改进** → 使用 TauriTavern 的宽松检测模式
2. **气泡旁路加固** → 检测到交互式 HTML 时始终跳过气泡
3. **高度自适应增强** → 引入 postMessage + MutationObserver 兜底
4. **用户设置** → 可选的启用/禁用开关
