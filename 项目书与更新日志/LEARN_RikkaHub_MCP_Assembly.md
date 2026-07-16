# RikkaHub MCP 服务实现 — 学习笔记 & 对接方案

> 学习来源：`C:\refs\rikkahub-master`（RikkaHub 开源项目，Kotlin 原生 Android）
> 学习目的：为香蕉牛奶机的 MCP 服务器连接功能提供架构参考，解决当前 MCP 连接失败的问题
> 参考服务：Ombre-Brain（`P0luz/Ombre-Brain`）、Nocturne Memory（`Dataojitori/nocturne_memory`）

---

## 一、背景：为什么我们的 MCP 连不上

当前香蕉牛奶机的 MCP 调用代码（`src/hooks/use-send-message.ts` 中的 `executeToolCall`）实现非常简单：

```
fetch(mcpServer.url, {
  method: 'POST',
  body: JSON.stringify({ method: 'tools/call', params: { name, arguments } })
})
```

这只是一个普通的 HTTP POST 请求，**缺少了 MCP 协议必须的初始化握手步骤**。MCP 协议要求客户端连接后先发 `initialize` 请求与服务端协商版本和能力，通过后才能发 `tools/call`。

此外，我们对传输协议的支持也不完整：
- **SSE 传输**：需要先通过 GET 建立 SSE 长连接，收到 `endpoint` 事件后再通过 POST 发请求
- **Streamable HTTP**：需要带 `initialize` 的 POST 握手，服务端可能返回 `202 Accepted` 并通过 SSE 流推送结果
- **OAuth 授权**：Ombre-Brain 等服务需要先完成 OAuth 授权流程才能拿到调用权限

---

## 二、RikkaHub MCP 整体架构

RikkaHub 使用官方 MCP Kotlin SDK（`io.modelcontextprotocol:kotlin-sdk` v0.14.0），在 Android 上实现了完整的 MCP 客户端生命周期。

### 2.1 目录结构

```
data/ai/mcp/
├── McpConfig.kt              # 配置模型（服务器配置、OAuth状态、工具定义）
├── McpManager.kt             # 核心管理器（连接生命周期、工具同步、重连、OAuth）
├── McpStatus.kt              # 状态枚举
├── McpOAuthCallback.kt       # OAuth 回调（Custom Tab 启动）
├── McpOAuthClient.kt         # OAuth 2.1 授权客户端（RFC 9728/8414/7591/8707）
└── transport/
    ├── SseClientTransport.kt           # [已注释] 自定义 SSE 传输层
    └── StreamableHttpClientTransport.kt # [已注释] 自定义 Streamable HTTP 传输层
```

注：`transport/` 下的自定义实现已注释，项目使用官方 SDK 内置的 `SseClientTransport` 和 `StreamableHttpClientTransport`。

### 2.2 核心概念：三种传输协议

| 传输协议 | 适用场景 | 特点 |
|---------|---------|------|
| **stdio** | 本地进程通信（如 Claude Desktop 启动 Python 脚本） | 通过标准输入输出通信，不能用于远程 |
| **SSE** (Server-Sent Events) | 远程 HTTP 服务 | GET 建 SSE 长连接，POST 发请求 |
| **Streamable HTTP** | 远程 HTTP 服务（新版标准） | 纯 HTTP POST，服务端可同步返回或异步推送 |

**对我们项目的意义**：用户将 Ombre-Brain 和 Nocturne Memory 部署在云服务器上，走的是 **SSE** 或 **Streamable HTTP** 传输。这两种都基于 HTTP，在我们的 WebView/浏览器环境中可以实现。

---

## 三、MCP 客户端生命周期的五个阶段

### 3.1 阶段概述

```
初始化（配置加载）
  → 连接（创建传输层）
  → 握手（initialize 协商）
  → 工具发现（listTools）
  → 工具调用（callTool）+ 结果处理
```

### 3.2 第一阶段：配置模型（McpConfig.kt）

```kotlin
// 服务端配置 — sealed class 支持两种传输协议
sealed class McpServerConfig {
  data class SseTransportServer(     // SSE 传输
    id: Uuid, url: String,
    commonOptions: McpCommonOptions
  )
  data class StreamableHTTPServer(   // Streamable HTTP 传输
    id: Uuid, url: String,
    commonOptions: McpCommonOptions
  )
}

data class McpCommonOptions(
  enable: Boolean,                    // 是否启用
  name: String,                       // 服务器名称
  headers: List<Pair<String, String>>, // 自定义请求头
  tools: List<McpTool>,               // 从服务器同步的工具列表
  oauth: McpOAuthState?               // OAuth 状态（含 Token）
)
```

关键设计：
- 用 `sealed class` + 序列化注解实现多态，一个配置列表可以混合多种传输类型
- `McpOAuthState` 持久化 OAuth 令牌，含自动刷新机制
- 令牌 `toString` 脱敏，避免日志泄露

### 3.3 第二阶段：连接与配置热监听

`McpManager` 在初始化时订阅配置变化，实现增量增删客户端：

```kotlin
init {
  appScope.launch {
    settingsStore.settingsFlow
      .map { settings -> settings.mcpServers }
      .collect { newConfigs ->
        val (toAdd, toRemove) = currentConfigs.checkDifference(newConfigs)
        toAdd.forEach { addClient(it) }
        toRemove.forEach { removeClient(it) }
      }
  }
}
```

`addClient` 完整流程：

```kotlin
suspend fun addClient(config: McpServerConfig) {
  val freshConfig = ensureFreshToken(config)      // ① OAuth 令牌刷新
  removeClient(config)                              // ② 清理旧连接

  val transport = getTransport(config)              // ③ 选择传输层
  transport.onClose { scheduleReconnect(config) }   // ④ 注册断线重连
  transport.onError { scheduleReconnect(config) }

  client.connect(transport)                         // ⑤ 建立连接
  sync(config)                                      // ⑥ 同步工具列表
}
```

#### 传输层选择

```kotlin
private fun getTransport(config: McpServerConfig): AbstractTransport = when (config) {
  is SseTransportServer -> SseClientTransport(
    urlString = config.url,
    client = httpClient,        // Ktor HttpClient
    requestBuilder = { headers.appendAll(config.resolveHeaders()) }
  )
  is StreamableHTTPServer -> StreamableHttpClientTransport(
    url = config.url,
    client = httpClient,
    requestBuilder = { headers.appendAll(config.resolveHeaders()) }
  )
}
```

### 3.4 第三阶段：MCP 初始化握手（`initialize`）

这是**我们当前代码缺失的核心步骤**。MCP 协议规定客户端必须先发送 `initialize` 请求：

```
客户端 → 服务端:
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "banana-milk-phone",
      "version": "1.0.0"
    }
  }
}

服务端 → 客户端:
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-11-05",
    "capabilities": {
      "tools": {},
      "resources": {},
      "prompts": {}
    },
    "serverInfo": {
      "name": "ombre-brain",
      "version": "1.0.0"
    }
  }
}

客户端 → 服务端:  (第二步通知)
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

只有在 `notifications/initialized` 发送完成后，才能调用 `tools/list`、`tools/call` 等方法。

### 3.5 第四阶段：工具发现（`listTools`）

握手完成后，通过 `client.listTools()` 获取服务端支持的工具列表：

```kotlin
val serverTools = client.listTools().tools
```

然后与本地持久化的工具配置做合并更新——保留已有工具的状态（启用/禁用），新增服务端有的工具，删除服务端已不存在的工具。

```kotlin
settingsStore.update { old ->
  old.copy(mcpServers = old.mcpServers.map { serverConfig ->
    // 新增服务器上有的工具
    // 更新已有工具的描述和 schema
    // 删除服务器上已不存在的工具
  })
}
```

### 3.6 第五阶段：工具调用与 AI 集成

```kotlin
suspend fun callTool(
  serverId: Uuid, toolName: String, args: JsonObject
): List<UIMessagePart> {
  // ① 检查 OAuth 令牌是否新鲜，必要时刷新
  val freshConfig = ensureFreshToken(config)
  if (token changed) addClient(freshConfig)

  // ② 确保传输层已连接
  if (client.transport == null) client.connect(getTransport(config))

  // ③ 发送 JSON-RPC 调用请求
  val result = client.callTool(
    request = CallToolRequest(
      params = CallToolRequestParams(name = toolName, arguments = args)
    ),
    options = RequestOptions(timeout = 120.seconds)
  )

  // ④ 转换响应为 UI 消息
  return result.content.map { when(it) {
    is TextContent -> UIMessagePart.Text(it.text)
    is ImageContent -> convertImageToFile(it)  // Base64 → 本地文件
    else -> UIMessagePart.Text(...)
  }}
}
```

#### 工具命名规范

MCP 工具被包装为 AI 内部的 Tool 对象，名称带命名空间前缀：

```kotlin
Tool(
  name = "mcp__${serverName}__${toolName}",   // 如 mcp__nocturne__read_memory
  description = tool.description ?: "",
  parameters = { tool.inputSchema },
  execute = { mcpManager.callTool(serverId, tool.name, it) }
)
```

这个命名规范我们在项目中已经在用（`use-send-message.ts` 第 109 行），说明这一点做对了。

---

## 四、OAuth 2.1 授权流程

Ombre-Brain 等 MCP 服务需要用户授权才能调用工具。这就是你在其他客户端点击后跳转到管理页输入秘钥的步骤。

### 4.1 完整授权流程

```
① 发现受保护资源
   → 从 WWW-Authenticate header 或 /.well-known/oauth-protected-resource 获取授权服务器信息

② 发现授权服务器
   → 从 /.well-known/oauth-authorization-server 获取 auth/token/registration 端点

③ 动态客户端注册
   → POST 注册端点，获取 client_id

④ PKCE 生成
   → code_verifier → SHA-256 → Base64 URL-safe (code_challenge)

⑤ 用户授权
   → 构建授权 URL → 打开浏览器/WebView → 用户登录并授权
   → 授权码通过 Deep Link 回调 (rikkahub://mcp-oauth-callback?code=xxx)

⑥ 令牌获取
   → 授权码 + code_verifier → 换取 access_token + refresh_token

⑦ 持久化令牌
   → 保存 OAuth 状态，后续请求自动带 token

⑧ 连接服务
   → 用 access_token 初始化 MCP 传输层
```

### 4.2 令牌自动刷新

`ensureFreshToken` 方法在每次调用工具前检查令牌是否将过期（提前 60 秒检测），自动用 refresh_token 刷新。

### 4.3 对我们项目的意义

浏览器和 Capacitor WebView 环境下没有办法直接打开系统浏览器进行 OAuth 授权跳转（需要 `@capacitor/browser` 插件）。但 Ombre-Brain 和 Nocturne Memory 也支持 **Bearer Token** 方式直接在请求头中带令牌：

```json
{
  "headers": {
    "Authorization": "Bearer your-api-token"
  }
}
```

用户已经在设置 APP 中配置了请求头和值，这说明不走 OAuth 流程也可以——关键在于 **MCP 协议握手** 而不是授权。

---

## 五、状态管理与重连机制

### 5.1 状态机

```
Idle → Connecting → Connected
                    ↓ (失败)
              Error / NeedsAuthorization
                    ↓ (OAuth 流程)
              Authorizing → Connected
Connected → Reconnecting → Connected
```

### 5.2 指数退避重连

- 初始重试间隔：1 秒
- 最大重试间隔：30 秒
- 最大重试次数：5 次
- 条件：只在 `Connected` 状态下断线才触发重连，正常关闭不重连
- Streamable HTTP 的 SSE 通知流耗尽时，不触发整体重连（POST 通道仍健康）

---

## 六、我们项目的 MCP 实现需要改什么

### 6.1 当前代码路径

```
设置 APP (MCPSettingsPage.tsx)
  → 用户添加 MCP 服务器配置（URL/Headers/协议类型）
  → 持久化到 settings-store（localStorage）
  → use-send-message.ts 读取 mcpServers
  → executeToolCall 直接 fetch POST 到 server.url
```

### 6.2 缺失的步骤

| 缺失步骤 | 影响 | 修复方案 |
|---------|------|---------|
| `initialize` 握手 | 所有 MCP 服务都拒绝请求 | 连接时先发 initialize → 等响应 → 发 initialized 通知 |
| 传输层选择 | 无法区分 SSE / Streamable HTTP / stdio | 在配置中增加协议类型字段，按类型选择传输实现 |
| `listTools` 工具发现 | 工具列表需要用户手动填写 | 连接成功后自动 pull 工具列表 |
| 连接池 + 生命周期 | 每次调用工具都重新连接 | 保持连接池，按服务器 ID 复用 |
| SSE 事件流监听 | Streamable HTTP 的异步结果收不到 | 服务端返回 202 时，去 SSE 端点监听结果推送 |

### 6.3 技术选型建议

香蕉牛奶机是 TypeScript 项目（React + Capacitor），无法直接使用 RikkaHub 的 Kotlin SDK。推荐使用官方 MCP TypeScript SDK：

```
npm install @modelcontextprotocol/sdk
```

该 SDK 提供了 `Client` 类，内置了 `initialize` 握手、`listTools`、`callTool` 等完整功能，并支持 SSE 和 Streamable HTTP 传输。

或者，由于我们的需求相对简单（主要调 `tools/call`），可以自己实现轻量级的 MCP 客户端，只需要：
1. 发送 `initialize` JSON-RPC 请求
2. 发送 `notifications/initialized`
3. 发送 `tools/call` JSON-RPC 请求
4. 维持 SSE 连接（如需要）

### 6.4 简化版实现思路（不依赖 SDK）

```typescript
// MCP 客户端类（轻量版）
class McpClient {
  private initialized = false;
  private serverInfo: any = null;

  async connect(url: string, headers: Record<string, string>) {
    // 1. Initialize 握手
    const initResult = await this.sendRequest(url, headers, 'initialize', {
      protocolVersion: '2025-11-05',
      capabilities: {},
      clientInfo: { name: 'banana-milk-phone', version: '1.0.0' }
    });
    this.serverInfo = initResult;
    this.initialized = true;

    // 2. 发送 initialized 通知
    await this.sendNotification(url, headers, 'notifications/initialized');

    // 3. 获取工具列表
    const toolsResult = await this.sendRequest(url, headers, 'tools/list');
    return toolsResult.tools;
  }

  async callTool(url: string, headers: Record<string, string>, name: string, args: any) {
    if (!this.initialized) throw new Error('Not initialized');
    return this.sendRequest(url, headers, 'tools/call', { name, arguments: args });
  }

  private async sendRequest(url: string, headers: Record<string, string>, method: string, params?: any) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'MCP Error');
    return data.result;
  }
}
```

---

## 七、总结与下一步

### 当前 MCP 连接失败的根本原因

**不是网络问题、不是配置问题——是我们的客户端没有做 MCP 协议要求的初始化握手（`initialize`）。** 所有符合规范的 MCP 服务端都会在收到 `tools/call` 前先等待 `initialize`，收不到就直接拒绝或超时。

### 修复路径（按工作量排序）

| 方案 | 工作量 | 效果 |
|------|--------|------|
| **A：轻量修复** — 在现有 `executeToolCall` 前加一次性握手（约 50 行代码） | 小 | 能连上 Streamable HTTP 服务，但不支持 SSE 异步推送 |
| **B：引入 MCP SDK** — 用 `@modelcontextprotocol/sdk` 替代手写 fetch | 中 | 完整协议支持，但需要重构 MCP 连接生命周期 |
| **C：RikkaHub 级别重构** — 完整实现连接池 + OAuth + 自动重连 + 工具发现 | 大 | 生产级质量，适合长期 |

### 已确认兼容的服务

| 服务 | 传输协议 | 连接方式 | 授权方式 |
|------|---------|---------|---------|
| Ombre-Brain (`P0luz/Ombre-Brain`) | Streamable HTTP / SSE | HTTP POST + 握手 | OAuth 2.1 或 Bearer Token |
| Nocturne Memory (`Dataojitori/nocturne_memory`) | Streamable HTTP (`/mcp`) / SSE (`/sse`) | HTTP POST + 握手 | Bearer Token (请求头) |

两个服务在云服务器上部署后都走 HTTP，在我们的 Capacitor WebView 中完全可实现连接。

### 相关文件索引

| 文件 | 位置 |
|------|------|
| 当前 MCP 调用代码 | `src/hooks/use-send-message.ts`（`executeToolCall` 函数） |
| 当前 MCP 配置 UI | `src/settings/components/MCPServerForm.tsx` |
| 当前 MCP 设置页 | `src/settings/pages/MCPSettingsPage.tsx` |
| 当前 MCP 状态页（聊天 APP 内） | `src/apps/chat/pages/MCPPage.tsx` |
| RikkaHub MCP 核心实现 | `C:\refs\rikkahub-master\data\ai\mcp\McpManager.kt` |
| RikkaHub OAuth 实现 | `C:\refs\rikkahub-master\data\ai\mcp\McpOAuthClient.kt` |
| 官方 MCP TypeScript SDK | `@modelcontextprotocol/sdk`（npm） |
