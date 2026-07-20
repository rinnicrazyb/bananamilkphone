# RikkaHub 存储与备份架构 — 学习笔记

> 学习时间：2026-07-18
> 参考项目：`C:\refs\rikkahub-master`
> 学习原因：需要对比验证我方（香蕉牛奶机）的存储架构是否合理，特别是图片/媒体数据的存储方式及备份机制。

---

## 1. RikkaHub 的存储架构

### 数据分层

```
┌─────────────────────────────────────────────┐
│  SQLite (Room)                               │
│  • rikka_hub.db（版本 24，databases/ 目录）    │
│  • 存：消息节点 JSON、对话元数据               │
│  • 无 BLOB — 图片存 file:// URI 字符串         │
├─────────────────────────────────────────────┤
│  DataStore (Preferences)                     │
│  • settings.json 一个键存储全部序列化配置      │
│  • 存：AI 设置、助手列表、世界书、quickMessage │
│         WebDAV 配置、S3 配置、显示设置         │
├─────────────────────────────────────────────┤
│  文件系统 (filesDir/)                        │
│  • upload/        ← 用户上传的图片/文档       │
│  • images/        ← 用户头像                  │
│  • fonts/         ← 自定义字体                │
│  • skills/        ← 技能文件                  │
│  • tool_outputs/  ← 工具输出文件              │
│  文件名：UUID（FileUtils.buildUuidFileName）   │
└─────────────────────────────────────────────┘
```

### 关键设计哲学

1. **配置即文本**：所有"设置类"数据（AI、助手、世界书、WebDAV）序列化为一个 `settings.json`——人类可读，单个文件导出就是完整配置
2. **图片不塞数据库**：头像、上传文件全部存磁盘。数据库只记录 `file://` URI
3. **托管文件表**（`managed_files`）：存文件名、MIME、大小等元数据，实际文件在磁盘
4. **Base64 自动转文件**：AI 生成的 Base64 图片由 `Base64ImageToLocalFileTransformer` 自动转为本地文件

---

## 2. RikkaHub 的备份架构

### 备份文件格式：ZIP 压缩包

```
backup_20260718_142530.zip
├── settings.json          ← 始终包含（必选）
├── rikka_hub.db           ← 可选（BackupItem.DATABASE）
├── upload/...             ← 可选（BackupItem.FILES）
├── skills/...             ← 可选
├── fonts/...              ← 可选
└── ...（其他可选项目）
```

### 三种备份目标（代码高度复用）

| 目标 | 实现 | 路径 |
|------|------|------|
| 本地文件 | `BackupVM.exportToFile()` / `restoreFromLocalFile()` | 手动保存/恢复 |
| WebDAV | `WebDavSync.kt` | `rikkahub_backups/` |
| S3 | `S3Sync.kt` | `rikkahub_backups/` |

### 导入/导出工具

- `LorebookSerializer` — SillyTavern JSON ←→ RikkaHub 格式双向转换
- `ChatboxImporter` — 从 Chatbox JSON 导入对话
- `CherryStudioProviderImporter` — 从 Cherry Studio 导入 AI 供应商配置

---

## 3. 我方（香蕉牛奶机）架构对比

### 当前（2026-07-18 状态）

```
用户操作 → Zustand store → sqliteStorageAdapter → sql.js (内存 SQLite)
     ↓                                                  ↓
   IndexedDB ← ← ← ← ← ← ← ← ← 防抖导出整个 .db 文件
```

| 维度 | RikkaHub | 香蕉牛奶机 | 优劣 |
|------|----------|-----------|------|
| 图片存储 | 文件系统（真磁盘文件） | SQLite `app_data` 表（base64 dataURL） | RikkaHub 优：无 33% 膨胀，读写快 |
| 配置存储 | DataStore（`settings.json`） | SQLite `app_data`（key-value） | 持平：都是序列化 JSON |
| 备份格式 | 多文件 ZIP | 单文件 .db 导出 | 我方优：更简单，一个文件全包括 |
| 写效率 | 改图片=写一个文件 | 改壁纸=重写整个 .db 到 IndexedDB | RikkaHub 优：无写放大 |
| 跨平台 | 原生 Android 独占 | 浏览器 + Android 共用 | 我方优：一套代码跑两端 |

### 为什么我们用了不同方案

浏览器环境**没有真正的文件系统**。`@capacitor/filesystem` 在浏览器开发模式下不可用（会被 shim 为内存实现）。所以 dataURL 是唯一选择。

等打包成 Android APK 后，可以逐步迁移到 RikkaHub 路线：
1. `@capacitor/filesystem` 写文件到 `filesDir/`
2. SQLite 只存 `file://` 路径
3. 备份改为 ZIP 打包

### 死代码识别

| 文件 | 状态 |
|------|------|
| `src/services/indexeddb/index.ts` | ❌ 无人引用，可清理或后续用于图片存储 |
| `src/services/sqlite/index.ts` 的 `saveMedia`/`getMedia`/`deleteMedia` | ❌ 无人引用，可清理或后续用于图片存储 |

---

## 4. 持久化防踩坑指南

### 反模式：useEffect 首次挂载覆盖

```tsx
// ❌ 错误：组件挂载时立即用默认 state 覆盖 SQLite
useEffect(() => {
  setItem('theme-config', JSON.stringify(theme));
}, [theme]);
```

**原因**：zustand store 的初始状态（默认值）在 `getItem` 异步加载完成前就已经存在。`useEffect` 在首次渲染后触发，保存默认值→覆盖 SQLite 中的真实数据。

**修复**：

```tsx
// ✅ 通过 ref/flag 标记数据加载完成，之后再允许保存
const dataLoaded = useRef(false);

useEffect(() => {
  getItem('my-key').then((saved) => {
    if (saved) useAppStore.getState().loadFromBackup(JSON.parse(saved));
    dataLoaded.current = true;
  });
}, []);

useEffect(() => {
  if (dataLoaded.current) setItem('my-key', JSON.stringify(data));
}, [data]);
```

### 正确模式：统一在 App.tsx 管理持久化

类似 `usePersistence()` 的架构——**一个地方加载，一个地方保存**，而不是分散在各个 APP 的 effect 里。主题持久化已从 ThemePage 迁移到 App.tsx，遵循此模式。

---

## 5. 相关文件

| 文件 | 说明 |
|------|------|
| `C:\refs\rikkahub-master` | 参考项目根目录 |
| `src/services/sqlite/index.ts` | SQLite 服务（sql.js，含 app_data + media 表） |
| `src/services/persistence/index.ts` | 聊天/世界书数据持久化服务 |
| `src/store/settings-store.ts` | 设置 store（带 persist 到 SQLite 示例） |
| `src/App.tsx` | 启动时加载主题 + 内存提取 + 通知初始化 |
| `项目书与更新日志/bananamilkphone项目书.md` | 项目书（存储章节已更新） |
