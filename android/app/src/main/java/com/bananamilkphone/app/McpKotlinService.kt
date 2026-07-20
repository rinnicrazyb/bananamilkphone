package com.bananamilkphone.app

import android.util.Log
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import io.modelcontextprotocol.kotlin.sdk.client.Client
import io.modelcontextprotocol.kotlin.sdk.client.StreamableHttpClientTransport
import io.modelcontextprotocol.kotlin.sdk.types.Implementation
import io.modelcontextprotocol.kotlin.sdk.types.TextContent
import kotlinx.coroutines.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/**
 * MCP Kotlin 原生服务 — 对标 RikkaHub McpManager.kt。
 *
 * 使用 Kotlin MCP SDK + Ktor HttpClient + OkHttp，
 * 完全在 Android 原生层处理 MCP 协议，不经过 JS Bridge 传输 HTTP body。
 *
 * 仅处理 StreamableHTTP 协议（POST JSON-RPC），不支持 SSE 通知流。
 */
object McpKotlinService {

    private const val TAG = "McpKotlinService"

    private val okHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.MINUTES)
        .writeTimeout(120, TimeUnit.SECONDS)
        .followSslRedirects(true)
        .followRedirects(true)
        .build()

    private val ktorClient = HttpClient(OkHttp) {
        engine { preconfigured = okHttpClient }
        install(ContentNegotiation) {
            json(Json { prettyPrint = true; isLenient = true })
        }
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /** serverId → (config JSON, Client) */
    private val clients = mutableMapOf<String, Pair<String, Client>>()

    /**
     * 连接到 MCP 服务器。
     *
     * @param serverId 唯一标识
     * @param configJson 服务器配置 JSON:
     *   { "url": "http://...", "headers": { "Key": "Value" } }
     * @return 工具列表 JSON 数组
     */
    suspend fun connect(serverId: String, configJson: String): String = withContext(Dispatchers.IO) {
        // 先断开旧连接
        disconnect(serverId)

        val config = Json.decodeFromString<McpServerConfig>(configJson)
        val url = config.url
        val headers = config.headers

        Log.i(TAG, "Connecting to $url")

        val transport = StreamableHttpClientTransport(
            url = url,
            client = ktorClient,
            requestBuilder = {
                headers.forEach { (key, value) ->
                    this.headers.append(key, value)
                }
            }
        )

        val client = Client(
            clientInfo = Implementation(name = "bananamilkphone", version = "0.2.0")
        )

        client.connect(transport)
        val toolsResult = client.listTools()
        val tools = toolsResult.tools ?: emptyList()

        clients[serverId] = Pair(configJson, client)

        Log.i(TAG, "Connected to $url, found ${tools.size} tools")

        Json.encodeToString(
            kotlinx.serialization.builtins.ListSerializer(McpToolInfo.serializer()),
            tools.map { McpToolInfo(it.name, it.description ?: "") }
        )
    }

    /** 断开 MCP 服务器 */
    suspend fun disconnect(serverId: String) {
        clients.remove(serverId)?.let { (_, client) ->
            runCatching { client.close() }
        }
    }

    /** 获取已发现的工具 */
    suspend fun listTools(serverId: String): String {
        val (_, client) = clients[serverId] ?: return "[]"
        val tools = client.listTools().tools ?: emptyList()
        return Json.encodeToString(
            kotlinx.serialization.builtins.ListSerializer(McpToolInfo.serializer()),
            tools.map { McpToolInfo(it.name, it.description ?: "") }
        )
    }

    /** 调用 MCP 工具 */
    suspend fun callTool(serverId: String, toolName: String, argsJson: String): String {
        val (_, client) = clients[serverId]
            ?: throw IllegalStateException("Server not connected: $serverId")

        val args = Json.decodeFromString<JsonObject>(argsJson)
        val result = client.callTool(
            request = io.modelcontextprotocol.kotlin.sdk.types.CallToolRequest(
                params = io.modelcontextprotocol.kotlin.sdk.types.CallToolRequestParams(
                    name = toolName,
                    arguments = args
                )
            )
        )

        return Json.encodeToString(
            kotlinx.serialization.builtins.ListSerializer(McpToolResult.serializer()),
            result.content.map {
                when (it) {
                    is TextContent -> McpToolResult(it.text)
                    else -> McpToolResult(it.toString())
                }
            }
        )
    }

    @JvmStatic
    fun connectSync(serverId: String, configJson: String, callback: (String?, String?) -> Unit) {
        scope.launch {
            try {
                val tools = connect(serverId, configJson)
                callback(tools, null)
            } catch (e: Exception) {
                Log.e(TAG, "connect failed", e)
                callback(null, e.message ?: "Unknown error")
            }
        }
    }

    @JvmStatic
    fun disconnectSync(serverId: String) {
        scope.launch { disconnect(serverId) }
    }

    @JvmStatic
    fun callToolSync(serverId: String, toolName: String, argsJson: String, callback: (String?, String?) -> Unit) {
        scope.launch {
            try {
                val result = callTool(serverId, toolName, argsJson)
                callback(result, null)
            } catch (e: Exception) {
                Log.e(TAG, "callTool failed", e)
                callback(null, e.message ?: "Unknown error")
            }
        }
    }
}

@kotlinx.serialization.Serializable
data class McpServerConfig(
    val url: String,
    val headers: Map<String, String> = emptyMap()
)

@kotlinx.serialization.Serializable
data class McpToolInfo(
    val name: String,
    val description: String
)

@kotlinx.serialization.Serializable
data class McpToolResult(
    val text: String
)
