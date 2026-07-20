package com.bananamilkphone.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

import okhttp3.Headers;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * MCP 原生 HTTP 插件。
 *
 * 绕过 CapacitorHttp bridge 的 body 二次编码和 SSE 流不支持问题，
 * 直接使用 OkHttp 发送 MCP 协议请求（POST JSON-RPC）。
 *
 * 仅处理标准请求/响应（POST + GET），不涉及 SSE 流解析。
 * SSE 通知流通过禁用 SDK 的 reconnection 来规避。
 *
 * 参考 RikkaHub McpManager.kt：独立 HTTP 客户端处理 MCP 传输。
 */
@CapacitorPlugin(name = "McpNative")
public class McpNativePlugin extends Plugin {

    private OkHttpClient httpClient;

    @Override
    public void load() {
        httpClient = new OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(120, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .followRedirects(true)
                .followSslRedirects(true)
                .build();
    }

    /**
     * 发送 MCP HTTP 请求。
     *
     * JS 调用参数：
     *   method:  string   — HTTP 方法（POST / GET）
     *   url:     string   — 完整 URL
     *   headers: object   — 请求头
     *   body:    string?  — JSON-RPC 请求体
     *
     * 返回：
     *   status:  number
     *   headers: object   — 响应头（含 mcp-session-id 等）
     *   body:    string   — 响应体文本
     */
    @PluginMethod
    public void request(PluginCall call) {
        String method = call.getString("method", "POST");
        String url = call.getString("url");
        JSObject headersObj = call.getObject("headers");
        String body = call.getString("body");

        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        try {
            // 构建请求头
            Headers.Builder headersBuilder = new Headers.Builder();
            if (headersObj != null) {
                java.util.Iterator<String> keys = headersObj.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    String value = headersObj.optString(key);
                    if (value != null && !value.isEmpty()) {
                        headersBuilder.add(key, value);
                    }
                }
            }

            // 构建请求体
            RequestBody requestBody = null;
            if (body != null && !body.isEmpty()) {
                String contentType = headersObj != null ? headersObj.optString("Content-Type") : null;
                MediaType mediaType = contentType != null
                        ? MediaType.parse(contentType)
                        : MediaType.parse("application/json");
                requestBody = RequestBody.create(body, mediaType);
            }

            // 发送请求
            Request request = new Request.Builder()
                    .url(url)
                    .method(method, requestBody)
                    .headers(headersBuilder.build())
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                JSObject result = new JSObject();
                result.put("status", response.code());

                // 响应头（保留 mcp-session-id 等 MCP 关键头）
                JSObject respHeaders = new JSObject();
                Headers responseHeaders = response.headers();
                for (int i = 0; i < responseHeaders.size(); i++) {
                    respHeaders.put(responseHeaders.name(i), responseHeaders.value(i));
                }
                result.put("headers", respHeaders);

                // 响应体
                if (response.body() != null) {
                    result.put("body", response.body().string());
                } else {
                    result.put("body", "");
                }

                call.resolve(result);
            }
        } catch (IOException e) {
            call.reject("HTTP request failed: " + e.getMessage(), "IO_ERROR", e);
        } catch (Exception e) {
            call.reject("Unexpected error: " + e.getMessage(), "UNKNOWN_ERROR", e);
        }
    }
}
