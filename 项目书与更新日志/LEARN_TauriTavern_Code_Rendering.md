# 学习笔记：TauriTavern 聊天消息 HTML 渲染架构

> 来源：`C:\refs\TauriTavern-docs-refresh` 项目源码分析
> 日期：2026-07-20
> 目的：对齐香蕉牛奶机的 HTML 渲染方案

---

## 一、核心渲染管线

TauriTavern 使用 **Vanilla JS + jQuery + Showdown** 的消息渲染管线：

```
原始消息文本
  → substituteParams (参数替换)
  → 用户自定义 regex 替换
  → 自动修复 Markdown（平衡星号）
  → HTML 标签编码（用户可选：encode_tags 开关）
  → 引号包裹 → <q> 标签
  → Showdown.makeHtml() (Markdown → HTML)
  → DOMPurify.sanitize() (安全过滤)
  → <style> 标签作用域化 (.mes_text 前缀)
  → innerHTML 注入 .mes_text
```

### 香蕉牛奶机对应实现

```
原始消息文本
  → react-markdown + remark-gfm (GFM)
  → rehype-raw (透传 HTML)
  → rehype-sanitize (允许 style/class/id)
  → InteractiveHTML iframe (纯 HTML 片段)
  → MessageRenderer (React 组件树)
```

---

## 二、布局差异：平铺 vs 气泡

| 特性 | TauriTavern | 香蕉牛奶机 |
|------|-----------|----------|
| 布局风格 | 扁平文档流（论坛/日志） | 移动端聊天气泡 |
| 消息容器 | `.mes` flex: avatar + mes_block | `MessageRenderer` with bubble/flat toggle |
| 文字宽度 | 全宽（无 max-width 限制） | 气泡模式 max-width: 85% |
| HTML 渲染 | 全宽 innerHTML 注入 | 格式化内容全宽，纯文本气泡内 |
| 头像 | 固定左侧列 | 可选，36px 圆形 + 头像框 |

---

## 三、流式渲染（TauriTavern 有，我们缺失）

TauriTavern 的 `StreamingProcessor` 类：
- 每 chunk 调用 `messageFormatting()` → `innerHTML` 更新
- **morphdom** 做高效 DOM 差分（而非 full replace）
- `Intl.Segmenter` 做词级分割 + CSS fade-in 动画
- 流式推理（reasoning）单独处理，不同样式
- 支持用户中途停止流式生成

**香蕉牛奶机状态：** 消息是原子化的——只有发送中/已发送/已读状态图标，无增量文本渲染。

---

## 四、代码块渲染

TauriTavern：
- Showdown 原生 fenced code block 解析
- `addCopyToCodeBlocks()` 给每个 `<pre><code>` 添加 Font Awesome 复制按钮
- `CodeHighlightCoordinator` 视口感知的延迟语法高亮
- `html-code-preview.js`：检测代码块是否为可交互 HTML → 替换为 `<iframe>` 沙盒预览，有**展开切换按钮**（替换最后一条消息）

香蕉牛奶机：
- react-markdown `<pre>` 组件覆盖，`language-html` 代码块 → `InteractiveHTML` iframe
- **缺失**：复制按钮、语法高亮、预览展开/切换
- 有 code block 基础样式（padding, background, border-radius）

---

## 五、我们已对齐的改动（2026-07-20）

1. `renderContinuous` 重构：思考链/内容分离，格式化内容不走气泡
2. `InteractiveHTML` iframe 去 `borderRadius` 和 `overflow:hidden`，透明背景
3. `MarkdownRenderer` 补充 `blockquote`（左边框+斜体）和 `hr` 组件
4. CSS 补充 `.markdown-content blockquote/hr` 兜底样式

---

## 六、尚存差距（后续可做）

| 功能 | 优先级 |
|------|--------|
| 流式渲染（增量文本 + morphdom） | 高 |
| 代码块复制按钮 | 中 |
| 语法高亮（highlight.js） | 中 |
| HTML 预览展开/切换按钮 | 低 |
| `<style>` 作用域化防泄漏 | 低 |
| 消息编辑 UI | 低 |
| 用户 CSS 覆盖文件 | 低 |
