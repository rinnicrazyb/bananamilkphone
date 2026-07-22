# 香蕉牛奶机 — 开发日志

> 精简版（2026-07-21 整理）：仅保留架构决策和里程碑，移除已修复 bug 和重复状态表。

---

## 项目演进里程碑

### Phase 1：地基搭建（2026-07-15 前）
- React 18 + TypeScript + Vite + Capacitor + Zustand
- SQLite (sql.js WASM) → IndexedDB 持久化 .db 文件
- 事件总线（内存）APP 间通信
- Phosphor Icons 线条图标

### Phase 2：桌面 + 核心 APP（2026-07-15 ~ 2026-07-19）
**已完成 5 个 APP：**
- **桌面主屏幕**：Pointer Events 状态机，长按拖拽+碰撞挤走+翻页建页（2026-07-21 推倒重写）
- **聊天 APP**：Transformer Pipeline + 8 项功能盒 + 记忆提取 + 流式生成（2026-07-21 窗口化重构）
- **世界书 APP**：5 位置 PromptInjectionTransformer 注入 + 书架 UI + 书封裁剪 + 导入导出
- **设置 APP**：API 预设管理 + TTS/OCR 配置 + WebDAV 备份恢复 + MCP 双通道
- **主题 APP**：壁纸裁剪 + 字体 TTF + 自定义 APP 图标预设

**未开始：** 记忆游廊 APP

### 2026-07-19：MCP/HTTP 架构转型（决定性变更）
- **双通道 MCP**：浏览器 JS SDK + 手机 Kotlin SDK (`io.modelcontextprotocol:kotlin-sdk:0.14.0`)
- **HttpNativePlugin**：统一原生 HTTP（OkHttp + base64 body），杜绝 Capacitor Bridge 序列化损坏
- 对齐 RikkaHub：Kotlin 2.4.0 + Ktor 3.4.3

### 2026-07-21：桌面主屏幕完全重写
- 放弃 @dnd-kit → 手写 Pointer Events 状态机
- `useReducer`（拖拽阶段）+ `useRef`（同步读写 ghost 坐标）
- 预分配 3 页防止浏览器 touchcancel
- 数据模型：`desktopOrder: string[]` → `desktopGrid: (string|null)[]`

### 2026-07-21：聊天界面全面优化
**动机**：三方对比报告（vs RikkaHub vs TauriTavern）

**Phase 1 — 基础设施**：
- SQLite 新增 `messages` 表（14 字段 + conv_time 索引），与 blob 双写
- ChatView 窗口化渲染（80 条窗口 + IntersectionObserver 滚顶加载）
- 对话内搜索重写（卡片列表 + 高亮 + 跳转）
- 全局搜索 `/chat/search/:agentId`
- 换行修复：移动端 Enter=换行/按钮发送，桌面端 Enter=发送/Shift+Enter=换行

**Phase 2 — 渲染优化**：
- `highlight.js` 语法高亮（useMemo 渲染阶段，非 useEffect）
- HTML 流式控制：`isStreaming`→代码块 / 完毕→InteractiveHTML
- 流式 fadeIn 动画

**Phase 3 — 消息交互**：
- 右键/长按菜单（MessageContextMenu）：复制/编辑/删除/重新生成/导出
- 底部编辑抽屉（MessageEditDrawer）+ 导出抽屉（ExportDrawer，Markdown 格式）
- 分支箭头（◀ N/M ▶）+ 推理耗时（Timer 图标）
- 类型扩展：`reasoningDuration`, `branchParentId/Index/Total`, `favorite`

**Phase 4 — 后台底座**：
- `BackgroundTaskManager` 单例（startTask/abortTask/subscribe）
- `use-send-message` 注册为后台任务 + App.tsx 非活跃对话通知

**关键 bug 教训**：
- ChatView `subscribe` 只监听消息数量变化 → 流式更新只改内容不改数量 → LLM 回复不显示
- React `useEffect` DOM 操作被 Virtual DOM 覆盖 → 代码高亮消失 → 改 `useMemo` + `dangerouslySetInnerHTML`
- **RikkaHub 架构验证**：流式阶段纯内存 StateFlow 驱动 UI，DB 仅在完成后写入——我们应遵循相同原则

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

---

## 当前 APP 状态（2026-07-21 终态）

| APP | 状态 |
|-----|------|
| 桌面主屏幕 | ✅ Pointer Events 拖拽 |
| 聊天 APP | ✅ 窗口化+高亮+搜索+菜单+后台任务底座 |
| 世界书 APP | ✅ 完整 |
| 设置 APP | ✅ API 预设+TTS/OCR+WebDAV+MCP 双通道 |
| 主题 APP | ✅ 壁纸+字体+图标 |
| 记忆游廊 APP | ⬜ 未开始 |

---

## 下一步

1. **修bug**：修复上一个窗口残留的大量bug
2. **Phase 4 完善**：主动消息触发器（底座已就绪）
3. **合并 `desktop-redesign` → `main`**
4. **记忆游廊 APP**（用户多次强调"非常重要"）
5. **真机 APK 实测**

---

## 附：Git 分支

- 当前：`desktop-redesign`（含大量未提交更改）
- `main`：旧版代码

## 附：APK 打包

```bash
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot"
npm run build && npx cap sync android && cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk (~32MB)
```

---

### 2026-07-21（延续）：消息数据结构重构 — flat → MessageNode

**动机**：四次修复后仍有 8 个顽固 bug，根因全是数据结构不对。

**核心变更**：
- **数据模型**：`messages: Record<string, Message[]>` → `messageNodes: Record<string, MessageNode[]>`
- **MessageNode**（对齐 RikkaHub）：`{ id, role, messages: Message[], selectedIndex: number }`
- **currentMessages**（对齐 RikkaHub `currentMessages`）：`nodes.map(n => n.messages[n.selectedIndex])`
- 节点位置由 `messageNodes` 数组 index 固定，永不按时间戳重排

**修复的 8 个 bug**：
1. ✅ 复制按钮只复制 `{` → 改用 DOM ref 读 textContent
2. ✅ HTML 无限拉长 → iframe 高度用 ref 操作 DOM，不走 React state
3. ✅ 编辑后分支箭头不显示 → getCurrentMessages 设置 branchNodeId/Index/Total
4. ✅ 消息重复发送 → sendMessage 跳过 store 中已存在的重复消息
5. ✅ 新对话第一条不显示 → syncFromStore 无守卫条件，始终更新
6. ✅ 重新生成无效 → regenerateMessage 调 sendMessage + excludeNodeIds
7. ✅ 用户消息无重新发送 → 右键菜单 + 编辑抽屉重新发送按钮
8. ✅ 推理耗时无数据 → reasoningStartTime → reasoningDuration

**架构决策**：
| 决策 | 结论 | 日期 |
|------|------|------|
| 消息数据结构 | `messageNodes: MessageNode[]`，替代 flat `Message[]` | 2026-07-21 |
| 分支系统 | 节点内 `messages[]` 存所有分支，`selectedIndex` 切换 | 2026-07-21 |
| LLM 上下文 | 使用 `getCurrentMessages()`（同显示），非全量数据 | 2026-07-21 |
| 流式持久化 | 完成后 `dbUpdateMessage` 写 DB，搜索依赖 DB 内容 | 2026-07-21 |
| 复制按钮 | JSX 渲染 CopyButton 组件，不使用 DOM append | 2026-07-21 |
| iframe 高度 | 用 ref 直接操作 DOM，消除 React state feedback loop | 2026-07-21 |

**关键教训**（见项目书与更新日志/复盘总结.md）
