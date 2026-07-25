# RikkaHub 本地工具（Local Tools）架构 — 学习笔记

> 学习来源：`C:\refs\rikkahub-master`（RikkaHub 开源项目，Kotlin 原生 Android）
> 学习日期：2026-07-25
> 学习目的：为香蕉牛奶机聊天 APP 添加本地工具功能提供架构参考

---

## 一、整体架构

本地工具是 RikkaHub 中与**搜索工具、MCP 工具、历史对话工具**并列的四大工具来源之一。

```
ChatService.sendMessage()
  → tools = buildList {
      addAll(searchTools)        // 搜索工具
      addAll(localTools)         // ← 本地工具（本文档）
      addAll(conversationTools)  // 历史对话工具
      addAll(mcpTools)           // MCP 工具
    }
  → GenerationHandler.generateText(tools)
    → generateInternal()
      → system prompt 拼接（含每个工具的 systemPrompt 回调）
      → Provider.streamText()
      → Tool Call 循环（escalate/execute/continue）
```

---

## 二、本地工具类型

### 2.1 枚举定义

**文件**: `app/src/main/java/me/rerere/rikkahub/data/ai/tools/local/LocalToolOption.kt`

```kotlin
@Serializable
sealed class LocalToolOption {
    @SerialName("javascript_engine") data object JavascriptEngine : LocalToolOption()
    @SerialName("time_info")         data object TimeInfo : LocalToolOption()
    @SerialName("clipboard")         data object Clipboard : LocalToolOption()
    @SerialName("tts")               data object Tts : LocalToolOption()
    @SerialName("ask_user")          data object AskUser : LocalToolOption()
    @SerialName("screen_time")       data object ScreenTime : LocalToolOption()
    @SerialName("calendar")          data object Calendar : LocalToolOption()
}
```

每个工具对应一个 Tool 实例，惰性加载。

### 2.2 7 个本地工具总览

| 工具 | 工具名 | 底层实现 | 权限需求 | 需审批 |
|------|--------|----------|----------|--------|
| JavaScript 引擎 | `eval_javascript` | QuickJS 沙箱 | 无 | 否 |
| 时间信息 | `get_time_info` | `ZonedDateTime.now()` | 无 | 否 |
| 剪贴板 | `clipboard_tool` | `ClipboardManager` | 无 | 否 |
| 文字转语音 | `text_to_speech` | AppEventBus → TTSManager | 无 | 否 |
| 询问用户 | `ask_user` | HITL 审批流程 | 无 | **是** |
| 屏幕时间 | `get_screen_time` | `UsageStatsManager` | **QUERY_ALL_PACKAGES + PACKAGE_USAGE_STATS** | 否 |
| 日历（查询+创建） | `calendar_query` / `calendar_create` | `ContentResolver (CalendarContract)` | **READ/WRITE_CALENDAR** | 仅创建 |

---

## 三、核心：Tool 接口定义

**文件**: `ai/src/main/java/me/rerere/ai/core/Tool.kt`

```kotlin
@Serializable
data class Tool(
    val name: String,
    val description: String,
    val parameters: () -> InputSchema? = { null },
    val systemPrompt: (model: Model, messages: List<UIMessage>) -> String = { _, _ -> "" },
    val needsApproval: (JsonElement) -> Boolean = { false },
    val execute: suspend (JsonElement) -> List<UIMessagePart>
)
```

关键设计：
- **`parameters`** 是惰性 lambda，`InputSchema.Obj(properties, required)` 格式，按需生成参数 schema
- **`systemPrompt`** 是回调函数，每个工具可以返回一段文本注入到 system prompt 尾部——这是用户可自定义的关键点
- **`needsApproval`** 也是回调，接收调用参数，返回是否需要用户审批
- **`execute`** 是 suspend 函数，接收 JSON 参数，返回 `List<UIMessagePart>`

---

## 四、注册中心：LocalTools.kt

**文件**: `app/src/main/java/me/rerere/rikkahub/data/ai/tools/local/LocalTools.kt`

```kotlin
class LocalTools(
    private val context: Context,
    private val eventBus: AppEventBus,
    private val ttsManager: TTSManager,
    private val settingsStore: SettingsStore
) {
    private val javascriptTool by lazy { buildJavascriptTool() }
    private val timeInfoTool by lazy { buildTimeInfoTool() }
    private val clipboardTool by lazy { buildClipboardTool(context) }
    private val textToSpeechTool by lazy { buildTextToSpeechTool(eventBus) }
    private val askUserTool by lazy { buildAskUserTool() }
    private val screenTimeTool by lazy { buildScreenTimeTool(context, eventBus) }
    private val calendarTool by lazy { buildCalendarTool(context) }

    fun getTools(options: List<LocalToolOption>): List<Tool> {
        val tools = mutableListOf<Tool>()
        options.forEach { option ->
            when (option) {
                LocalToolOption.JavascriptEngine -> tools.add(javascriptTool)
                LocalToolOption.TimeInfo -> tools.add(timeInfoTool)
                LocalToolOption.Clipboard -> tools.add(clipboardTool)
                LocalToolOption.Tts -> tools.add(textToSpeechTool)
                LocalToolOption.AskUser -> tools.add(askUserTool)
                LocalToolOption.ScreenTime -> tools.add(screenTimeTool)
                LocalToolOption.Calendar -> {
                    tools.add(calendarQueryTool)
                    tools.add(calendarCreateTool)
                }
            }
        }
        return tools
    }
}
```

每个工具 `by lazy` 惰性初始化，仅在启用时创建。Calendar 启用时注册两个工具（查询 + 创建）。

---

## 五、每个本地工具的详细实现

### 5.1 JavaScript 引擎 — `eval_javascript`

**文件**: `app/src/main/java/me/rerere/rikkahub/data/ai/tools/local/JavascriptTool.kt`

```kotlin
internal fun buildJavascriptTool(): Tool = Tool(
    name = "eval_javascript",
    description = "执行 JavaScript 代码……",
    parameters = {
        InputSchema.Obj(buildJsonObject {
            put("code", buildJsonObject {
                put("type", "string")
                put("description", "要执行的 JavaScript 代码")
            })
        }, listOf("code"))
    },
    systemPrompt = { _, _ -> "" },
    execute = {
        val logs = arrayListOf<String>()
        val context = QuickJSContext.create()
        context.setConsole(object : QuickJSContext.Console {
            override fun log(info: String?) { logs.add("[LOG] $info") }
            override fun info(info: String?) { logs.add("[INFO] $info") }
            override fun warn(info: String?) { logs.add("[WARN] $info") }
            override fun error(info: String?) { logs.add("[ERROR] $info") }
        })
        val code = it.jsonObject["code"]?.jsonPrimitive?.contentOrNull
        val result = context.evaluate(code)
        val resultStr = result?.let { r ->
            if (r is QuickJSObject) r.stringify() else r.toString()
        } ?: "undefined"
        listOf(UIMessagePart.Text(
            text = "执行结果：\n```json\n${resultStr}\n```\n日志：\n${logs.joinToString("\n")}"
        ))
    }
)
```

底层依赖：`wang.harlon.quickjs:wrapper-android:3.2.3` — QuickJS 的 Android 绑定库。
每次执行创建独立 `QuickJSContext`，执行完即丢弃，保证隔离安全。

### 5.2 时间信息 — `get_time_info`

**文件**: `app/src/main/java/me/rerere/rikkahub/data/ai/tools/local/TimeInfoTool.kt`

```kotlin
internal fun buildTimeInfoTool(): Tool = Tool(
    name = "get_time_info",
    description = "获取当前设备的详细时间信息……",
    parameters = {
        InputSchema.Obj(buildJsonObject {
            put("timezone", buildJsonObject { put("type", "string") })
        })
    },
    systemPrompt = { model, messages ->
        val now = ZonedDateTime.now()
        val zone = now.zone.id
        val offset = now.offset.totalSeconds / 60
        val weekdays = listOf("星期一","星期二","星期三","星期四","星期五","星期六","星期日")
        "<time_info>\n当前设备时间：${now.toLocalDateTime()}\n当前星期：${weekdays[now.dayOfWeek.value - 1]}\n时区：${zone}\nUTC偏移(分钟)：${offset}\n</time_info>\n"
    },
    execute = {
        val tz = it.jsonObject["timezone"]?.jsonPrimitive?.contentOrNull
        val now = if (tz != null) ZonedDateTime.now(ZoneId.of(tz)) else ZonedDateTime.now()
        "时间信息：${now.toLocalDateTime()} 星期${now.dayOfWeek.value}"
    }
)
```

**关键设计**：`systemPrompt` 回调在每次生成时自动将当前时间注入到 system prompt 中。这意味着 LLM **不需要调用工具**就能感知当前时间。工具本身作为备用方法存在（当 LLM 需要特定时区或精确时间戳时）。

### 5.3 剪贴板 — `clipboard_tool`

**文件**: `app/src/main/java/me/rerere/rikkahub/data/ai/tools/local/ClipboardTool.kt`

```kotlin
internal fun buildClipboardTool(context: Context): Tool = Tool(
    name = "clipboard_tool",
    description = "读取或写入设备剪贴板内容……",
    parameters = {
        InputSchema.Obj(buildJsonObject {
            put("action", buildJsonObject { put("type", "string"); put("enum", buildJsonArray { add("read"); add("write") }); put("description", "读取或写入") })
            put("content", buildJsonObject { put("type", "string"); put("description", "写入内容（action=write 时必填）") })
        }, listOf("action"))
    },
    execute = {
        val action = it.jsonObject["action"]?.jsonPrimitive?.contentOrNull
        when (action) {
            "read" -> {
                val clip = context.readClipboardText()
                "剪贴板内容：${clip ?: "（空）"}"
            }
            "write" -> {
                val content = it.jsonObject["content"]?.jsonPrimitive?.contentOrNull
                context.writeClipboardText(content)
                "已写入剪贴板"
            }
            else -> error("Unknown action: $action")
        }
    }
)
```

读取/写入通过 `ContextUtil.kt` 中的扩展函数封装 `ClipboardManager`。

### 5.4 文字转语音 — `text_to_speech`

**文件**: `app/src/main/java/me/rerere/rikkahub/data/ai/tools/local/TextToSpeechTool.kt`

```kotlin
internal fun buildTextToSpeechTool(eventBus: AppEventBus): Tool = Tool(
    name = "text_to_speech",
    description = "将文字转为语音播放。适合朗读长文本、通知、消息……",
    parameters = {
        InputSchema.Obj(buildJsonObject {
            put("text", buildJsonObject { put("type", "string") })
        }, listOf("text"))
    },
    systemPrompt = { model, messages ->
        // 从 settingsStore 获取 TTS provider 的语气/风格指引
        val ttsProvider = ... // 用户配置的 TTS 风格
        if (ttsProvider.isNotEmpty()) {
            "<tts_style>播放语音时使用以下语气风格：${ttsProvider.systemPrompt}</tts_style>\n"
        } else ""
    },
    execute = {
        val text = it.jsonObject["text"]?.jsonPrimitive?.contentOrNull
        eventBus.emit(AppEvent.Speak(text))
        "已添加到播放队列：${text.take(30)}..."
    }
)
```

**关键设计**：
- `systemPrompt` 回调注入 TTS 语气风格到 system prompt，让 LLM 知道 TTS 会用什么语气朗读
- 执行时发送 `AppEvent.Speak` 事件，由 `TTSManager`（在 RouteActivity 中订阅）实际播放
- 异步非阻塞，不等待播放完成就返回结果

### 5.5 询问用户 — `ask_user`

**文件**: `app/src/main/java/me/rerere/rikkahub/data/ai/tools/local/AskUserTool.kt`

```kotlin
internal fun buildAskUserTool(): Tool = Tool(
    name = "ask_user",
    description = "向用户提出问题并等待回答。适合需要用户输入信息、做选择、确认的场合……",
    parameters = {
        InputSchema.Obj(buildJsonObject {
            put("id", buildJsonObject { put("type", "string"); put("description", "问题唯一标识") })
            put("question", buildJsonObject { put("type", "string"); put("description", "向用户提出的问题") })
            put("options", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type", "string") }) })
            put("selection_type", buildJsonObject { put("type", "string"); put("enum", buildJsonArray { add("single"); add("multiple") }) })
        }, listOf("id", "question"))
    },
    needsApproval = { true },
    execute = { error("ask_user tool should be handled by HITL flow") }
)
```

**关键设计**：
- `needsApproval = { true }` — 永远需要审批
- `execute` 直接抛异常——**永远不会被执行**
- 实际流程：UI 层检测到 `ask_user` 调用 → 渲染交互式表单 → 用户回答 → 设置状态为 `Answered` → 重新进入生成循环

### 5.6 屏幕时间 — `get_screen_time`

**文件**: `app/src/main/java/me/rerere/rikkahub/data/ai/tools/local/ScreenTimeTool.kt`

```kotlin
internal fun buildScreenTimeTool(context: Context, eventBus: AppEventBus): Tool = Tool(
    name = "get_screen_time",
    description = "获取设备上各个应用的使用时间统计……",
    parameters = {
        InputSchema.Obj(buildJsonObject {
            put("time_range", buildJsonObject {
                put("type", "string")
                put("enum", buildJsonArray { add("today"); add("last_7_days"); add("last_30_days") })
            })
        })
    },
    systemPrompt = { _, _ -> "" },
    execute = {
        // 检查权限 → 如无权限则通过 eventBus 发起权限请求
        // 使用 UsageStatsManager.queryEvents() 遍历事件
        // 用"全局单一前台模型"计算每个 App 的真实前台时长
        // 排除桌面 launcher
        // 返回各 App 使用时长（毫秒）
    }
)
```

实现复杂，使用 `UsageStatsManager.queryEvents()` API，需要 `PACKAGE_USAGE_STATS` 权限。

### 5.7 日历（查询 + 创建）

**文件**: `app/src/main/java/me/rerere/rikkahub/data/ai/tools/local/CalendarTool.kt`

两个工具：

```kotlin
// 查询日历
Tool(name = "calendar_query", execute = {
    // 通过 ContentResolver.query(CalendarContract.Instances.CONTENT_URI)
    // 支持时间范围、关键词搜索、limit
})

// 创建日历事件
Tool(name = "calendar_create", needsApproval = { true }, execute = {
    // 通过 ContentResolver.insert(CalendarContract.Events.CONTENT_URI)
    // 默认 1 小时时长
    // 始终需要用户审批确认
})
```

需要 `READ_CALENDAR` 和 `WRITE_CALENDAR` 权限。

---

## 六、systemPrompt 回调拼接机制

**文件**: `app/src/main/java/me/rerere/rikkahub/data/ai/GenerationHandler.kt:363-386`

```kotlin
val system = buildString {
    if (effectiveSystemPrompt.isNotBlank()) append(effectiveSystemPrompt)
    if (assistant.enableMemory) { appendLine(); append(buildMemoryPrompt(memories)) }
    tools.forEach { tool ->
        appendLine()
        append(tool.systemPrompt(model, messages))  // ← 每个工具的注入
    }
}
```

这意味着：
- **TimeInfo** 自动将当前时间注入 system prompt（即使 LLM 没调工具）
- **TTS** 注入语气风格指引
- 其他工具可以按需注入额外上下文

---

## 七、HITL 审批流程

**状态机**（`ai/src/main/java/me/rerere/ai/ui/Message.kt:273-304`）:

```
ToolApprovalState
  ├── Auto       → 自动执行（默认）
  ├── Pending    → 等待用户审批
  ├── Approved   → 用户已批准
  ├── Denied     → 用户已拒绝（带原因）
  └── Answered   → 用户已回答（ask_user 专用）
```

**执行流程**（`GenerationHandler.kt:190-315`）:

```
1. LLM 返回 tool_calls
2. 遍历每个调用，检查 toolDef.needsApproval(input)
3. 需审批且当前为 Auto → 改为 Pending → 暂停生成
4. 等待用户 UI 交互（表单/按钮）
5. 用户操作后状态变为 Approved/Denied/Answered
6. 再次进入生成循环 → 分发处理
   - Denied → 返回错误消息给 LLM
   - Answered → 返回用户答案（ask_user）
   - Approved → 执行 toolDef.execute(input)
7. 执行结果写回 messages → 继续下一轮 tool calling
```

---

## 八、AppEventBus 事件系统

**文件**: `app/src/main/java/me/rerere/rikkahub/data/event/AppEventBus.kt`

```kotlin
class AppEventBus {
    private val _events = MutableSharedFlow<AppEvent>(extraBufferCapacity = 16)
    val events: SharedFlow<AppEvent> = _events.asSharedFlow()
    suspend fun emit(event: AppEvent) { _events.emit(event) }
    fun tryEmit(event: AppEvent): Boolean = _events.tryEmit(event)
}
```

**事件类型**:

| 事件 | 触发方 | 消费方 |
|------|--------|--------|
| `Speak(text)` | TTS 工具执行时 | TTSManager（RouteActivity） |
| `OpenUsageAccessSettings` | ScreenTime 工具（无权限时） | RouteActivity 打开系统设置 |
| `ChatGenerationUpdate` | GenerationHandler | ChatNotificationManager |
| `ChatGenerationEnded` | GenerationHandler | ChatNotificationManager |

---

## 九、与香蕉牛奶机的差异分析

| 维度 | RikkaHub（Kotlin 原生） | 香蕉牛奶机（Web + Capacitor） |
|------|------------------------|-------------------------------|
| 运行环境 | Kotlin/JVM，直接调用 Android API | 浏览器/WebView，通过 JS API |
| JavaScript 引擎 | QuickJS（原生 so 库） | Web Worker / iframe sandbox / eval5 |
| 剪贴板 | `ClipboardManager` | `navigator.clipboard.readText()/writeText()` |
| TTS | 原生 `TextToSpeech` + AppEventBus | Web Speech API `speechSynthesis` |
| 屏幕时间 | `UsageStatsManager`（系统 API） | Capacitor 插件或无替代 |
| 日历 | `ContentResolver + CalendarContract` | Capacitor 插件（@capacitor/calendar） |
| 工具定义格式 | Kotlin data class + JSON Schema | TypeScript interface + OpenAI format |
| 事件总线 | Kotlin SharedFlow | 自研 EventBus（发布-订阅） |
| 权限管理 | Android 权限系统 | Web API + Capacitor 插件 |

---

## 十、关键学习要点

1. **每个工具包含 6 个要素**：name / description / parameters / systemPrompt / needsApproval / execute
2. **systemPrompt 回调**是用户自定义提示词的入口点——每个工具可以注入额外上下文到 system prompt
3. **TimeInfo 的特殊设计**：不依赖工具调用，通过 systemPrompt 回调自动注入当前时间
4. **AskUser 的"永不执行"模式**：needsApproval=true + execute 抛异常，完全由 HITL 流程接管
5. **QuickJS 每次执行新建上下文**：安全隔离 + 自然回收
6. **AppEventBus 解耦工具执行与 UI 层**：TTS 不直接播放，而是发送事件
7. **Calendar 启用 = 注册两个工具**：查询（自动）+ 创建（需审批）
8. **ScreenTime 的权限检查**：在 UI 开关处预先检查权限，不在运行时失败
