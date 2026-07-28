
## 一、项目定位

**香蕉牛奶机（Banana Milk Phone）** — 一个 "小手机" 风格的 AI 伴侣安卓软件。打开软件如同打开一部真实手机：桌面布局、壁纸、APP 网格、拖拽整理。

目标：让 AI 伴侣能感知用户生活——时间、天气、应用使用、主动发消息。

---

## 二、技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端框架 | **React 18 + TypeScript** | 组件化，类型安全 |
| 构建工具 | **Vite** | 快速 HMR |
| 跨平台壳 | **Capacitor** | 打包 Android APK |
| 原生 HTTP | **HttpNativePlugin (OkHttp + base64)** | 手机端 MCP/搜索/WebDAV 绕开 Capacitor Bridge 序列化 |
| MCP 协议 | **JS SDK (浏览器) + Kotlin SDK (手机)** | 双通道共享同一套 MCP 服务器配置 |
| 持久化 | **SQLite (sql.js WASM) → IndexedDB** | 存放聊天/设置/世界书/主题等全部文本数据 |
| 备份 | **本地 .db 导出 + WebDAV（坚果云）** | 单文件备份 |
| APP 通信 | **事件总线（内存）** | APP 间低耦合 |
| 状态管理 | **Zustand** | 轻量状态，关键数据持久化到 SQLite |
| AI 调用 | **LLM API + Tool Call** | 流式输出，支持工具调用 |
| 图标 | **Phosphor Icons** | 专业线条图标库 |
| 代码高亮 | **highlight.js** | 语法高亮 + 复制按钮 |
| 消息渲染 | **react-markdown + InteractiveHTML iframe** | Markdown 渲染 + 交互式 HTML |

### 关键架构决策

1. **双通道 MCP** — 浏览器端 JS SDK，手机端 Kotlin SDK，共享配置。
2. **统一原生 HTTP** — 手机端所有 HTTP 走 HttpNativePlugin (OkHttp)，body base64 编码。
3. **Transformer Pipeline 在 JS 侧** — 世界书/Placeholder 与 UI 配置深度耦合，留在 JS 层。
4. **流式纯内存渲染** — 流式过程中从 Zustand store 读（纯内存），DB 仅在完成后写入。
5. **窗口化聊天** — 80 条消息窗口 + IntersectionObserver 滚顶加载，放弃虚拟滚动（iframe 不兼容）。
6. **MessageNode 数据结构** — 分支消息通过 `messages[]` + `selectedIndex` 实现。

---

## 三、代码约定

### 3.1 目录结构

```
bananamilkphone/
├── src/
│   ├── apps/
│   │   ├── launcher/               # 桌面主屏幕
│   │   ├── chat/                   # 聊天 APP
│   │   ├── theme/                  # 主题 APP
│   │   ├── settings/               # 设置 APP
│   │   └── lorebook/               # 世界书 APP
│   ├── services/
│   │   ├── event-bus/              # 事件总线
│   │   ├── sqlite/                 # SQLite 封装
│   │   ├── webdav/                 # WebDAV 同步
│   │   ├── chat-send/              # 消息发送 + LLM 调用
│   │   ├── transformer-pipeline/   # Transformer 管道
│   │   ├── mcp-client/             # MCP 客户端
│   │   ├── llm/                    # LLM API 调用
│   │   ├── persistence/            # 持久化层
│   │   ├── backup/                 # 备份服务
│   │   └── notification/           # 通知服务
│   ├── components/                 # 共享 UI 组件
│   └── hooks/                      # 共享 Hooks
├── android/                        # Capacitor Android 壳
│   └── app/src/main/java/com/bananamilkphone/app/
│       ├── MainActivity.java       # Capacitor 主 Activity
│       ├── HttpNativePlugin.java   # 原生 HTTP 插件
│       ├── McpNativePlugin.java    # MCP 原生插件
│       ├── McpKotlinService.kt     # MCP Kotlin 服务
│       └── WebDavNativePlugin.java # WebDAV 原生插件
├── capacitor.config.ts
├── package.json
├── vite.config.ts
└── tsconfig.json
```

### 3.2 命名规范

- **组件**：PascalCase — `ChatMessage.tsx`
- **文件/目录**：kebab-case — `message-list.tsx`
- **函数/变量**：camelCase
- **常量**：UPPER_SNAKE_CASE
- **事件名**：`app-name:event-name` — `chat:message-sent`

### 3.3 组件规范

- 每个 APP 目录内含 `pages/`、`components/`、`hooks/`、`store/` 子目录
- APP 间通过事件总线通信，不直接引用
- 共享 UI 组件放顶层 `components/`

### 3.4 Git 提交规范

```
<type>(<scope>): <描述>

类型: feat / fix / refactor / style / docs / chore
```

---

## 四、已完成 APP

### 桌面主屏幕（Launcher）

| 功能 | 实现方式 |
|------|---------|
| 4×6 网格 | 固定行列布局 |
| 多分页 | 左右滑动翻页 + 圆点导航 |
| 长按拖拽排序 | Pointer Events 状态机（手写，非 @dnd-kit） |
| 状态栏 | 显示实时时间 |
| 壁纸 | 支持背景图 + 透明度 + 暗色覆盖 |
| 边到边布局 | edge-to-edge，系统真实状态栏 |

**已知问题**：壁纸模糊效果为占位，未实现实时预览。

### 聊天 APP（Chat）

| 功能 | 实现方式 |
|------|---------|
| 流式消息渲染 | react-markdown + 逐字流式动画 |
| 消息操作 | 复制/编辑/删除/重新生成/导出 Markdown |
| 分支消息 | MessageNode 结构，messages[] + selectedIndex |
| 对话管理 | 多会话 CRUD，搜索，切换 |
| 智能体设置 | API Key / 模型 / System Prompt / Temperature |
| 功能盒 | 9 项功能入口（含 MCP、本地工具占位、上下文预览等） |
| 上下文预览 | 9 区块显示完整的 Transformer Pipeline 拼装 |
| 窗口化渲染 | 80 条窗口 + IntersectionObserver 滚顶加载 |
| 代码高亮 | highlight.js + 复制按钮 |
| HTML 渲染 | 交互式 HTML 通过 iframe 独立沙箱渲染 |
| 思考链展示 | 可折叠的思考链（Reasoning Block） |
| 内存页面 | 记忆列表（分类筛选） |

### 世界书 APP（Lorebook）

| 功能 | 实现方式 |
|------|---------|
| 书架网格 | 2 列网格布局，书封 + 名称 + 简介 |
| 详情页 | 封面/目录/条目（翻页滑动 + 侧边栏导航） |
| 条目编辑器 | Chip 关键词、5 种注入位置、优先级、扫描深度、角色、正则、常驻 |
| 书封图片 | 支持裁剪（3:4 / 300px） |
| 导入导出 | JSON 格式（单本） |
| 激活机制 | 常驻激活 / 关键词匹配激活 / 正则匹配 |
| 注入位置 | 系统提示词前/后、对话开头、最新消息前、指定深度 |

### 设置 APP（Settings）

| 功能 | 实现方式 |
|------|---------|
| API 预设管理 | 多 API Key/模型预设，加密存储 |
| MCP 服务器配置 | 全字段配置（名称/URL/Key），测试连接 |
| WebDAV 同步 | 坚果云配置，自动/手动同步 |
| 本地备份 | .db 文件导入导出 |
| 网络搜索 | Tavily Search API 配置 |
| 通知开关 | 通知启用/禁用 |

### 主题 APP（Theme）

| 功能 | 实现方式 |
|------|---------|
| 主色板 | 选择主色调 |
| 字体 | 系统字体 + TTF 上传 |
| 暗色模式 | 跟随系统/手动切换 |
| 桌面壁纸 | 选图 + 裁剪（9:16 / 360px） + 透明度 + 模糊（占位） |
| 图标预设 | 默认/自定义图标集，保存/应用/删除 |
| 通知样式 | 通知海报图片裁剪（2:3 / 180px） |

---

## 五、架构说明

### 5.1 消息流

```
用户输入 → chat-send/index.ts
  → Transformer Pipeline（system prompt / 世界书 / 记忆 / placeholder 注入）
  → LLM API 流式调用
  → 流式更新 → Zustand store → React 渲染
  → 生成完成 → 持久化到 SQLite
```

- Transformer Pipeline 全部在 JS 侧（与 UI 配置耦合）
- 工具循环在 JS 侧（LLM 返回 tool_calls → 本地执行 → 拼接后继续生成）
- 流式过程纯内存驱动，DB 仅在完成后写入

### 5.2 MCP 架构

```
浏览器端: JS MCP SDK → 直接 HTTP SSE 连接 MCP 服务器
手机端:   Kotlin MCP SDK → OkHttp SSE 连接同一套 MCP 服务器
```

`isNative()` 自动切换通道，共享同一套 MCP 服务器配置。

### 5.3 持久化

- 全部数据存储在 SQLite（sql.js WASM），.db 文件写入 IndexedDB
- 消息双写：实时数据在 Zustand store（内存），完成同步到 SQLite
- WebDAV 同步的是完整的 .db 文件

---

## 六、未实现 / 待定

| 功能 | 说明 |
|------|------|
| 本地工具系统 | 剪贴板/TTS/日历/屏幕时间等工具未实现（在 git 历史 `5ac6678+` 中备份） |
| 主动消息 | ForegroundService + 通知系统的 AI 主动推送未实现 |
| 记忆游廊 APP | 全新 APP，未开始 |
| 桌面壁纸模糊 | 当前为占位，无实时预览 |
| 关键词正则匹配 | PromptInjectionTransformer 中的关键词/正则逻辑待完善 |
| 其他 APP | 档案馆/街机厅/酒馆/图书馆/音乐 均为规划占位，未开发 |
