# 香蕉牛奶机 — 开发日志

> 面向接手 AI 的简明历史记录。仅含架构决策和里程碑，不记临时 bug 修复细节。

---

## Phase 1：地基搭建（2026-07-15 前）
- React 18 + TypeScript + Vite + Capacitor + Zustand
- SQLite (sql.js WASM) → IndexedDB 持久化
- 事件总线（内存）APP 间通信
- Phosphor Icons 线条图标

## Phase 2：桌面 + 核心 APP

### 桌面主屏幕 — Pointer Events 重写（2026-07-21）
- 放弃 @dnd-kit → 手写 Pointer Events 状态机
- `useReducer`（拖拽阶段）+ `useRef`（同步读写 ghost 坐标）
- 预分配 3 页防止 touchcancel
- 数据模型：`desktopOrder: string[]` → `desktopGrid: (string|null)[]`

### 聊天 APP — 窗口化重构（2026-07-21）
- SQLite 新增 `messages` 表，与 blob 双写
- 窗口化渲染（80 条 + IntersectionObserver 滚顶加载）
- highlight.js 语法高亮（useMemo 阶段）
- HTML 流式控制（iframe 沙箱）
- 消息操作菜单：复制/编辑/删除/重新生成/导出
- 分支消息：MessageNode 结构（messages[] + selectedIndex）
- 后台任务底座（BackgroundTaskManager）

### 消息数据结构重构（2026-07-21 延续）
- flat `Message[]` → `MessageNode[]`（对齐 RikkaHub）
- 节点位置由数组 index 固定，永不按时间戳重排
- 分支通过 `messages[n].selectedIndex` 切换
- 修复 8 个顽固 bug

### 关键 bug 教训
- `subscribe` 只监听消息数量变化 → 流式更新改内容不改数量时不触发 → LLM 回复不显示
- `useEffect` DOM 操作被 Virtual DOM 覆盖 → 代码高亮消失 → 改 `useMemo` + `dangerouslySetInnerHTML`
- **RikkaHub 架构验证**：流式阶段纯内存 StateFlow 驱动 UI，DB 仅完成后写入

### MCP/HTTP 架构转型（2026-07-19）
- **双通道 MCP**：浏览器 JS SDK + 手机 Kotlin SDK
- **HttpNativePlugin**：统一原生 HTTP（OkHttp + base64 body）
- 对齐 RikkaHub：Kotlin 2.4.0 + Ktor 3.4.3

---

## 关键架构决策（不可逆）

| 决策 | 结论 | 日期 |
|------|------|------|
| 存储架构 | SQLite (sql.js) → IndexedDB 存 .db。消息双写（blob + messages 表） | 2026-07-21 |
| MCP 架构 | 浏览器 JS SDK + 手机 Kotlin SDK 双通道 | 2026-07-19 |
| HTTP 层 | 手机端统一 HttpNativePlugin (OkHttp + base64) | 2026-07-19 |
| 聊天滚动 | 窗口化聊天（80 条窗口），放弃虚拟滚动（iframe 兼容） | 2026-07-21 |
| 桌面拖拽 | Pointer Events 状态机，放弃 @dnd-kit | 2026-07-21 |
| 消息渲染 | react-markdown + hljs(useMemo) + InteractiveHTML iframe | 2026-07-21 |
| UI 实时性 | 流式过程从 store 读（纯内存），DB 仅持久化 | 2026-07-21 |
| 消息数据结构 | `messageNodes: MessageNode[]`，替代 flat `Message[]` | 2026-07-21 |
| 分支系统 | 节点内 `messages[]` 存所有分支，`selectedIndex` 切换 | 2026-07-21 |
| Transformer Pipeline | 留在 JS 侧（世界书/placeholder 与 UI 配置深度耦合） | 2026-07-21 |
| 工具执行循环 | 在 JS 侧（chat-send 中管理工具分发+执行） | 2026-07-21 |

---

## 当前 APP 状态（commit `8d52593`）

| APP | 状态 | 功能 |
|-----|------|------|
| 桌面主屏幕 | ✅ 正常 | Pointer Events 拖拽、多分页、壁纸、状态栏 |
| 聊天 APP | ✅ 正常 | 流式渲染、分支消息、功能盒、记忆、上下文预览 |
| 世界书 APP | ✅ 正常 | 5 位置注入、书架、封面裁剪、JSON 导入导出 |
| 设置 APP | ✅ 正常 | API 预设、MCP 双通道、WebDAV、备份 |
| 主题 APP | ✅ 正常 | 壁纸裁剪、TTF 字体、图标预设、通知样式 |
| 记忆游廊 APP | ⬜ 未开始 | |

**未实现**：本地工具（剪贴板/TTS/日历/屏幕时间）、主动消息（ForegroundService 推送）、壁纸模糊预览。

---

## 附：Git 分支

| 分支 | HEAD | 说明 |
|------|------|------|
| `* main` | `8d52593` | **当前在用** — edge-to-edge 全屏，无本地工具 |


## 附：APK 打包

```bash
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot"
npm run build && npx cap sync android && cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```
