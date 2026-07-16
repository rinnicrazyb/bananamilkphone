# 设置 APP — 开发计划

> 基于 grill-me 访谈确认的完整规格

---

## 一、总体架构

### UI 布局（列表式菜单）

```
┌─────────────────────────────────────┐
│ ← 设置                               │
├─────────────────────────────────────┤
│ 🤖 AI 设置  (区块标题)               │
│   API 设置                      →   │
│   网络搜索配置                  →    │
│   MCP 服务器配置                →    │
│   TTS 语音配置        即将推出       │
│                                      │
│ 📦 数据  (区块标题)                  │
│   本地备份                      →    │
│   本地恢复                      →    │
│   WebDAV 同步         即将推出        │
│                                      │
│ ⚙️ 通用  (区块标题)                  │
│   消息通知               ● ● ●  ● 开 │  ← inline 开关
│                                      │
│ ℹ️ 关于                              │
│   版本          v0.2.0               │
│   项目    香蕉牛奶机                  │
├─────────────────────────────────────┤
│         [确认]        [取消]          │
└─────────────────────────────────────┘
```

### 子页面导航

设置主页面使用 `useState<SubPage | null>` 控制子页面渲染，不依赖 react-router。每个子页面左上角有 `← 返回`，返回时回到主菜单。

### 数据流

```
settings-store (全局 Zustand)
  ├── llmConfig         → API 设置子页面
  ├── searchProviders   → 网络搜索子页面 → Chat 功能盒读取
  ├── mcpServers        → MCP 子页面     → Chat 功能盒读取
  ├── notificationsEnabled → 通用 inline 开关
  └── (备份独立操作，不存 store)
```

---

## 二、分步计划（8 个步骤）

### Step 1 — Store & 类型扩展 + JSZip 安装

**涉及文件：**
- `src/store/settings-store.ts` — 重写，新增所有字段
- `src/apps/chat/types.ts` — 为 MCP/搜索补充类型（可选）
- `package.json` — 添加 `jszip`

**新增类型定义（内联在 store 中或独立 `src/apps/settings/types.ts`）：**

```typescript
// MCP 服务器
interface MCPServer {
  id: string;
  name: string;
  url: string;
  apiKey?: string;
  protocol: 'sse' | 'streamable-http';
  enabled: boolean;     // 启动/停止状态
}

// 搜索供应商
interface SearchProvider {
  apiKey: string;
  maxResults: number;   // 结果数量限制
}

interface SearchProviders {
  tavily: SearchProvider;
  firecrawl: SearchProvider;
  tinyfish: SearchProvider;
}
```

**Store 新增字段：**
```typescript
searchProviders: SearchProviders
mcpServers: MCPServer[]
notificationsEnabled: boolean
```

**安装：** `npm install jszip`

---

### Step 2 — 设置主页面 UI 重构（列表式菜单）

**涉及文件：**
- `src/apps/settings/pages/SettingsPage.tsx` — 重写
- `src/apps/settings/components/ApiSettings.tsx` — 调整子页面适配
- `src/index.css` — 新增列表式菜单样式

**变更内容：**
- 主页面改为区块标题 + 列表行样式
- 每行右侧显示 `→` 箭头
- 点击行设置 `subPage` 状态，渲染对应子页面
- 底部保留确认/取消按钮
- 消息通知 inline toggle 开关
- 关于区块显示版本号
- 即将推出的项显示灰色 + 标签

**新增 CSS 类：**
- `.settings-menu` / `.settings-menu__section` / `.settings-menu__item`
- `.settings-menu__item-label` / `.settings-menu__item-arrow` / `.settings-menu__item-badge`
- `.settings-toggle` inline 开关样式

---

### Step 3 — API 设置增强（已有功能完善）

**涉及文件：**
- `src/apps/settings/components/ApiSettings.tsx` — 增加「拉取模型列表」按钮
- `src/services/llm/` — 可能需要新增 `fetchModels` 函数

**变更内容：**
- 保持现有字段（baseUrl/Key/模型/Temperature/TopP）
- 增加「📥 拉取模型列表」按钮
- 点击后向 `{baseUrl}/models` 发送请求（OpenAI 兼容接口）
- 返回的模型列表用下拉框 `<select>` 展示，用户选择后填入 model 字段
- 输入 API Key 后加密存储（已有的 crypto 服务接入）

---

### Step 4 — 网络搜索配置页（新增）

**涉及文件：**
- `src/apps/settings/pages/NetworkSearchPage.tsx` — 新建
- `src/index.css` — 补充表单样式

**页面内容：**
- 三个区块，统一布局：
  - 区块标题（如 "Tavily"）
  - API Key 输入框（密码模式 + 👁️ 显隐）
  - 结果数量限制输入框（数字输入，默认 5，范围 1-50）
- 三个区块分别是：Tavily / firecrawl / tinyfish
- 修改立即写入 store（无需确认按钮，子页面自己的保存逻辑）

---

### Step 5 — MCP 服务器配置页（新增，核心功能）

**涉及文件：**
- `src/apps/settings/pages/MCPSettingsPage.tsx` — 新建
- `src/apps/settings/components/MCPServerForm.tsx` — 新建（添加/编辑表单）
- `src/index.css` — MCP 列表和表单样式

**页面内容：**

**列表视图：**
- 已配置的 MCP 服务器卡片列表
- 每张卡片显示：名称 / URL / 协议标签 / 状态指示灯（绿色运行/灰色停止）
- 每张卡片上的操作按钮：启动/停止开关 / 连通性测试 / 编辑 / 删除
- 右上角「+ 添加」按钮

**添加/编辑表单（弹窗或嵌入页面）：**
- 服务器名称（必填）
- URL（必填，https:// 格式校验）
- API Key（可选，密码模式）
- 传输协议选择：SSE / Streamable HTTP（下拉或单选）
- 底部「确认」/「取消」按钮

**连通性测试：**
- 点击「测试连接」→ 向 MCP URL 发送初始化请求
- 成功：显示 ✅ + 延迟时间
- 失败：显示 ❌ + 错误信息

**启停逻辑：**
- 手动点击开关 → 尝试连接/断开
- 连接成功后状态灯变绿

---

### Step 6 — 本地备份/恢复（新增）

**涉及文件：**
- `src/apps/settings/pages/BackupPage.tsx` — 新建
- `src/apps/settings/pages/RestorePage.tsx` — 新建
- `src/services/backup/index.ts` — 新建，备份恢复核心逻辑
- `package.json` — JSZip 已安装

**备份流程：**
1. 用户进入「本地备份」页
2. 弹窗询问「是否包含 API Key 等敏感信息？」
3. 自动扫描所有数据源：
   - localStorage 中所有以 `-store` 结尾的键（Zustand 持久化数据）
   - IndexedDB 中所有数据库（媒体文件等）
4. 生成 Zip 包，内部结构：
   ```
   backup-20260715.zip
   ├── manifest.json          （备份元数据：时间、版本、包含的store列表）
   ├── stores/                （每个store一个JSON文件）
   │   ├── settings-store.json
   │   ├── chat-store.json
   │   └── app-store.json
   ├── indexeddb/             （IndexedDB数据）
   │   └── banana-milk-db.json
   └── info.txt               （简单说明文本）
   ```
5. 浏览器自动下载 zip 文件

**恢复流程：**
1. 用户进入「本地恢复」页
2. 点击选择 zip 文件（`<input type="file">`）
3. 预览备份信息（时间、包含内容）
4. 弹窗警告「当前数据将被覆盖，是否继续？」
5. 确认后解包 → 写回 localStorage + IndexedDB
6. 提示「恢复完成，部分更改可能需要刷新页面生效」

---

### Step 7 — 通用（消息通知）+ 关于

**涉及文件：**
- `src/apps/settings/pages/SettingsPage.tsx` — 已有，Step 2 已包含开关
- `src/apps/settings/pages/SettingsPage.tsx` — 已有，关于区块

**变更内容：**
- 消息通知开关已包含在 Step 2 的主页 inline 开关中
- 关于区块显示版本号 `v0.2.0` + 项目说明
- 此步骤主要是确认 Step 2 的正确性，如有遗漏补充

---

### Step 8 — 聊天 APP 耦合更新

**涉及文件：**
- `src/apps/chat/pages/ChatPage.tsx` — 替换 MCP/WebSearch 的 StubPage
- `src/apps/chat/components/FunctionBox.tsx` — 无需改动（按钮已有）
- `src/apps/chat/pages/MCPPage.tsx` — 新建
- `src/apps/chat/pages/WebSearchPage.tsx` — 新建
- `src/apps/chat/store/chat-store.ts` — 可能需要扩展 Agent 的 enableMCP/enableWebSearch 逻辑
- `src/apps/chat/types.ts` — `AgentDisplayConfig` 已有 `enableMCP` / `enableWebSearch` 字段

**MCP 配置页（聊天内）：**
- 读取 `settings-store` 中已启动的 MCP 服务器列表
- 每个服务器显示：名称 + 状态 + 智能体级启用/禁用开关
- 开关控制 `AgentDisplayConfig.enableMCP` 的细化版本
- 浮动按钮「去设置APP配置」→ 跳转到 `/settings`

**网络搜索页（聊天内）：**
- 读取 `settings-store` 中已配置的搜索供应商列表
- 每个供应商显示：名称（Tavily/firecrawl/tinyfish）+ 已配置状态
- 智能体级启用/禁用开关 → 控制 `AgentDisplayConfig.enableWebSearch`

---

## 三、文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 修改 | 添加 `jszip` 依赖 |
| `src/store/settings-store.ts` | **重写** | 扩展所有新字段 |
| `src/apps/settings/types.ts` | **新建** | MCP/搜索/备份类型定义 |
| `src/apps/settings/pages/SettingsPage.tsx` | **重写** | 列表式菜单 + 子页面路由 |
| `src/apps/settings/components/ApiSettings.tsx` | 修改 | 增加拉取模型列表按钮 |
| `src/apps/settings/pages/NetworkSearchPage.tsx` | **新建** | 三个供应商配置 |
| `src/apps/settings/pages/MCPSettingsPage.tsx` | **新建** | MCP服务器列表+管理 |
| `src/apps/settings/components/MCPServerForm.tsx` | **新建** | 添加/编辑MCP表单 |
| `src/apps/settings/pages/BackupPage.tsx` | **新建** | 本地备份 |
| `src/apps/settings/pages/RestorePage.tsx` | **新建** | 数据恢复 |
| `src/services/backup/index.ts` | **新建** | 备份/恢复核心逻辑 |
| `src/services/llm/index.ts` | 修改 | 增加 fetchModels 方法 |
| `src/apps/chat/pages/MCPPage.tsx` | **新建** | 聊天内MCP启用页 |
| `src/apps/chat/pages/WebSearchPage.tsx` | **新建** | 聊天内搜索启用页 |
| `src/apps/chat/pages/ChatPage.tsx` | 修改 | 替换 StubPage 引用 |
| `src/index.css` | 修改 | 新增列表菜单/MCP/搜索/备份样式 |

---

## 四、开发顺序与依赖关系

```
Step 1 (Store + 类型 + JSZip)
  ├── Step 2 (主页面 UI 重构) ← 依赖 Step 1
  │     ├── Step 3 (API 设置增强) ← 子页面，可并行
  │     ├── Step 4 (网络搜索)     ← 子页面，可并行
  │     ├── Step 5 (MCP 配置)     ← 子页面，可并行
  │     ├── Step 6 (备份/恢复)    ← 子页面，依赖 JSZip
  │     └── Step 7 (通知+关于)    ← 已包含在 Step 2
  └── Step 8 (聊天耦合)           ← 依赖 Step 1, 4, 5
```

实际上 Step 2-7 在 Step 1 完成后可以按任意顺序进行，但推荐：
**1 → 2 → (3 + 4 + 5 并行) → 6 → 7 → 8**

---

## 五、技术要点

### 子页面内部路由
使用 React state 而非 react-router：
```tsx
type SubPage = 'api' | 'network-search' | 'mcp' | 'backup' | 'restore' | null;
const [subPage, setSubPage] = useState<SubPage>(null);
```

### 加密接入
已有 `crypto/index.ts`（AES-GCM），在 store 的 setter 中：
- 写入时：`apiKey = await encrypt(plainKey)`
- 读取时：在输入框中显示解密后的明文
- 注意：加密是异步的，setter 需要改为 async

### 模型列表拉取
使用 fetch 调用 `GET {baseUrl}/models`（OpenAI 兼容接口），返回格式：
```json
{ "data": [{ "id": "gpt-4o", ... }] }
```

### MCP 连通性测试
发送 MCP 初始化请求（JSON-RPC over HTTP POST）：
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "capabilities": {},
    "clientInfo": { "name": "bananamilkphone", "version": "0.2.0" }
  }
}
```

### JSZip 备份
- 安装 `jszip` + `@types/jszip`（类型内置）
- 导出时：`zip.generateAsync({ type: 'blob' })` → 触发下载
- 导入时：`await zip.loadAsync(file)` → 逐文件解析

---

## 六、测试策略

| 步骤 | 测试方法 |
|------|---------|
| Step 1 | `console.log(useSettingsStore.getState())` 确认新字段存在 |
| Step 3 | 填入有效 OpenAI 兼容 API 地址+Key，点击拉取模型列表 |
| Step 4 | 填入 Tavily Key + maxResults，确认 store 中写入正确 |
| Step 5 | 添加/删除/启动/停止/测试 MCP 服务器全流程 |
| Step 6 | 执行备份 → 下载 → 恢复 → 确认数据完整 |
| Step 8 | 聊天功能盒点 MCP/搜索 → 看到设置APP中配置的服务器/供应商 |

---

## 七、未纳入本轮的功能（后续迭代）

| 功能 | 原因 | 状态 |
|------|------|------|
| TTS 语音配置 | 用户未选 | 保留「即将推出」占位 |
| WebDAV 同步 | 用户未选 | 保留「即将推出」占位 |
| 锁屏密码 | 用户不需要 | 彻底移除 |
| 多语言支持 | 用户不需要 | 彻底移除 |
| 提示词面板 | 用户未选 | 后续再议 |
