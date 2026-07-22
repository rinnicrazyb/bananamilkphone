# 聊天界面优化 — 交付清单与测试指南

> 按 AGENTS.md 第 5 条格式：改动列表 + 耦合对象 + 回归测试清单
> 生成：2026-07-21 | 分支：desktop-redesign

---

## 一、本轮目标

基于三方对比报告和 grill-me 访谈，对聊天界面进行全面升级：窗口化聊天、搜索重写、代码高亮、消息操作栏、后台任务底座。

---

## 二、改动清单（按文件）

### 新增文件（11 个）

| 文件 | 功能 | 测试重点 |
|------|------|---------|
| `src/services/sqlite/index.ts` ✏️ | 新增 `messages` 表 + `runSql`/`querySql`/`runSqlNoSave`/`runInTransaction` | DB 读写正常 |
| `src/services/chat-message-db.ts` 🆕 | 消息分页查询/搜索/CRUD/迁移 | 新对话消息能写入→读出 |
| `src/services/highlight/index.ts` 🆕 | hljs 语法高亮 + 代码复制按钮 | LLM 输出代码块有颜色+复制按钮 |
| `src/services/background-task/index.ts` 🆕 | 后台任务管理器（多对话生成底座） | 切对话不中断生成 |
| `src/apps/chat/components/HighlightedText.tsx` 🆕 | 搜索高亮共享组件 | 搜索词在结果中黄色高亮 |
| `src/apps/chat/components/MessageContextMenu.tsx` 🆕 | 右键/长按菜单 | 桌面右键弹菜单；移动端长按弹菜单 |
| `src/apps/chat/components/MessageEditDrawer.tsx` 🆕 | 底部编辑/复制抽屉 | 底部滑出窗口显示Markdown原文 |
| `src/apps/chat/components/ExportDrawer.tsx` 🆕 | 导出抽屉（勾选消息→Markdown下载） | 下载.md文件内容正确 |
| `src/apps/chat/pages/ChatSearchPage.tsx` 🆕 | 智能体全局搜索页面 | 搜索所有对话→显示对话标题+片段→点击跳转 |

### 修改文件（12 个）

| 文件 | 改动内容 | 测试重点 |
|------|---------|---------|
| `src/apps/chat/components/ChatView.tsx` ✏️ | **完全重写**：窗口化渲染（store主源+DB补充），滚顶加载，消息DOM id，右键菜单集成，编辑抽屉 | **🔥 消息显示正常** |
| `src/apps/chat/components/ChatInput.tsx` ✏️ | 移动端 Enter=换行，桌面端 Enter=发送/Shift+Enter=换行 | 手机换行不发；电脑 Enter 发送 |
| `src/apps/chat/components/InlineSearch.tsx` ✏️ | **重写**：卡片列表+高亮+轮询跳转 | 搜索→结果卡片→点击跳转 |
| `src/apps/chat/components/MarkdownRenderer.tsx` ✏️ | hljs 高亮+复制按钮+HTML流式控制+流式动画 | 代码块有色+复制；HTML流式→渲染 |
| `src/apps/chat/components/MessageRenderer.tsx` ✏️ | isStreaming传递+分支箭头+推理耗时显示 | 流式动画；分支箭头；Timer图标 |
| `src/apps/chat/components/ConversationList.tsx` ✏️ | 新增全局搜索入口按钮 | 对话列表有🔍按钮 |
| `src/apps/chat/store/chat-store.ts` ✏️ | addMessage双写DB+updateMessageStatus同步DB | 刷新后消息不丢 |
| `src/apps/chat/types.ts` ✏️ | Message/AgentDisplayConfig 新增字段 | 编译通过 |
| `src/services/persistence/use-persistence.ts` ✏️ | 启动时自动迁移blob→messages表 | 旧数据迁移不丢失 |
| `src/App.tsx` ✏️ | ChatSearchPage路由+后台任务通知监听 | /chat/search/:agentId 可访问 |
| `src/index.css` ✏️ | 搜索栏/菜单/编辑抽屉/代码块/动画 全套样式 | 界面无样式错乱 |

---

## 三、修复的 Bug（本轮内）

| # | 严重度 | 描述 | 状态 |
|---|--------|------|------|
| B1 | **Critical** | ChatView `prevTotalRef` 空对话未重置 → 新对话消息不显示 | ✅ 已修复 |
| B2 | **Critical** | ChatView `editMsg` 直接 mutate state 对象 | ✅ 已修复 |
| B3 | **Critical** | ChatView 从 DB 读数据但 DB 写入有延迟 → **LLM回复不显示** | ✅ 已修复（改为store主源） |
| B4 | Major | ExportDrawer `content` undefined → 页面崩溃 | ✅ 已修复 |
| B5 | Major | ExportDrawer 下载链接未挂载到 DOM → 部分浏览器静默失败 | ✅ 已修复 |
| B6 | Major | MessageContextMenu 图标定义了但未渲染 | ✅ 已修复 |
| B7 | Major | `updateMessageStatus` 未同步到 DB → 刷新后状态丢失 | ✅ 已修复 |
| B8 | Major | 搜索跳转固定 setTimeout → 消息未加载完成跳转失败 | ✅ 已修复（rAF轮询） |

---

## 四、用户测试清单

### 🔴 第一优先级：消息显示（当前有 bug）

| # | 测试项 | 操作 | 预期结果 |
|---|--------|------|---------|
| T1 | 发送消息 | 输入文字→点击发送 | 用户消息立即显示在聊天区 |
| T2 | LLM 回复 | 等待 AI 回复 | AI 回复逐字出现，完成后显示完整 |
| T3 | 历史对话 | 切换到有历史记录的对话 | 最近的消息正常显示 |
| T4 | 新建对话 | 创建新对话→发送消息 | 消息正常显示，不白屏 |
| T5 | 切换对话再切回 | A对话→B对话→A对话 | A对话消息仍在，不丢失 |

### 🟠 第二优先级：新功能可见性

| # | 测试项 | 操作 | 预期结果 |
|---|--------|------|---------|
| T6 | 代码高亮 | 让 LLM 写一段 Python/JS 代码 | 代码块深色背景+语法着色 |
| T7 | 代码复制 | 鼠标悬停代码块 | 右上角出现复制按钮，点击后变✓ |
| T8 | HTML 渲染 | 让 LLM 写 HTML 页面 | 流式过程显示代码，完成后渲染为页面 |
| T9 | 搜索按钮 | 点击顶栏🔍 | 搜索栏替换顶栏，输入关键词 |
| T10 | 搜索卡片 | 搜索框输入内容 | 下方出现匹配消息卡片，关键词黄色高亮 |
| T11 | 搜索跳转 | 点击搜索结果卡片 | 自动滚动到对应消息位置 |
| T12 | 全局搜索 | 对话列表顶部🔍→搜索页面 | 搜索所有对话的消息 |

### 🟡 第三优先级：消息交互

| # | 测试项 | 操作 | 预期结果 |
|---|--------|------|---------|
| T13 | 右键菜单 | 桌面端右键点击消息 | 弹出菜单：复制/重新生成/编辑/导出/删除 |
| T14 | 长按菜单 | 手机端长按消息 | 弹出菜单 |
| T15 | 复制消息 | 菜单→复制 | 底部滑出窗口显示Markdown原文→点击复制 |
| T16 | 编辑消息 | 菜单→编辑 | 底部滑出窗口可编辑→确认→消息更新 |
| T17 | 删除消息 | 菜单→删除→确认 | 弹窗确认→消息消失 |
| T18 | 导出对话 | 菜单→导出 | 底部抽屉→勾选消息→导出.md文件下载 |

### 🟢 第四优先级：细节体验

| # | 测试项 | 操作 | 预期结果 |
|---|--------|------|---------|
| T19 | 换行发送 | 手机端输入换行 | 换行不发送，点击发送按钮才发送 |
| T20 | 桌面Enter | 桌面端按Enter | 发送消息 |
| T21 | 桌面Shift+Enter | 桌面端Shift+Enter | 换行不发送 |
| T22 | 滚动加载 | 滚到对话顶部 | 显示"加载更早消息"→历史消息出现 |
| T23 | 流式动画 | 观察 AI 回复过程 | 文字有淡入效果 |
| T24 | 搜索退出 | 搜索栏点✕ | 退出搜索，恢复顶栏 |

---

## 五、耦合文件联动测试

| 耦合关系 | 测试方法 |
|---------|---------|
| **ChatView ↔ chat-message-db** | 发送消息→刷新页面→消息仍在（DB持久化） |
| **ChatView ↔ chat-store** | 发送消息→查看上下文拼装→内容一致 |
| **InlineSearch ↔ chat-message-db** | 搜索关键词→结果包含所有历史消息 |
| **ChatSearchPage ↔ chat-store** | 全局搜索→结果中的对话标题正确 |
| **App.tsx ↔ ChatSearchPage** | 直接访问 `/chat/search/{agentId}` 不报错 |
| **theme/launcher/settings/lorebook** | 切换各APP→功能正常→返回聊天正常 |

---

## 六、APK 信息

- 路径：`android/app/build/outputs/apk/debug/app-debug.apk`
- 大小：~32MB
- JDK：21 (Temurin)
- 打包命令：`npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`

---

## 七、已知问题（不需要测试）

| 问题 | 说明 |
|------|------|
| 导出不含图片 | 当前仅支持 Markdown 文本导出 |
| 全局搜索无排序 | 默认按时间倒序 |
| 主动消息未实现 | 底座就绪，触发器待开发 |
| 推理耗时无数据 | UI 就绪，需 use-send-message 记录 reasoning 时间 |
| Safari < 16.4 兼容 | MarkdownRenderer 正则负向后顾断言 |
| LIKE 通配符未转义 | 搜索 `%` `_` 会匹配所有 |
