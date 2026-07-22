package com.bananamilkphone.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.util.Base64;
import java.util.concurrent.TimeUnit;

import okhttp3.Headers;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * 统一原生 HTTP 插件 — 对标 RikkaHub Ktor HttpClient。
 *
 * 所有 HTTP 通信（MCP、搜索、抓取、WebDAV）统一走此插件，
 * 使用 OkHttp 直连，body 以 base64 编码传输，彻底避免
 * Capacitor Bridge 的 JSON 序列化对 HTTP body 的损坏。
 *
 * 请求参数：
 *   method:  string   — HTTP 方法
 *   url:     string   — 完整 URL
 *   headers: object   — 请求头 { "Key": "Value" }
 *   body:    string?  — base64 编码的请求体（null = 无 body）
 *
 * 返回：
 *   status:  number
 *   headers: object   — 响应头
 *   body:    string   — base64 编码的响应体（空字符串 = 无 body）
 */
@CapacitorPlugin(name = "HttpNative")
public class HttpNativePlugin extends Plugin {

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

    @PluginMethod
    public void request(PluginCall call) {
        String method = call.getString("method", "GET");
        String url = call.getString("url");
        JSObject headersObj = call.getObject("headers");
        String bodyBase64 = call.getString("body");  // base64, null = no body

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

            // 构建请求体（base64 → bytes）
            RequestBody requestBody = null;
            if (bodyBase64 != null && !bodyBase64.isEmpty()) {
                byte[] bodyBytes;
                try {
                    bodyBytes = Base64.getDecoder().decode(bodyBase64);
                } catch (IllegalArgumentException e) {
                    call.reject("Invalid base64 body: " + e.getMessage());
                    return;
                }

                // 对齐 RikkaHub：Content-Type 始终带 charset（Ktor 行为）
                String contentType = headersObj != null ? headersObj.optString("Content-Type") : null;
                if (contentType == null || contentType.isEmpty()) {
                    contentType = headersObj != null ? headersObj.optString("content-type") : null;
                }
                MediaType mediaType;
                if (contentType != null && !contentType.isEmpty()) {
                    // 追加 charset（若缺失），对齐 Ktor 的 ContentType.Application.Json 行为
                    if (contentType.contains("application/json") && !contentType.contains("charset")) {
                        contentType = "application/json; charset=utf-8";
                    }
                    mediaType = MediaType.parse(contentType);
                } else {
                    mediaType = MediaType.parse("application/json; charset=utf-8");
                }
                requestBody = RequestBody.create(bodyBytes, mediaType);
            }

            // 发送请求
            Request request = new Request.Builder()
                    .url(url)
                    .method(method.toUpperCase(), requestBody)
                    .headers(headersBuilder.build())
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                JSObject result = new JSObject();
                result.put("status", response.code());

                // 响应头
                JSObject respHeaders = new JSObject();
                Headers responseHeaders = response.headers();
                for (int i = 0; i < responseHeaders.size(); i++) {
                    respHeaders.put(responseHeaders.name(i), responseHeaders.value(i));
                }
                result.put("headers", respHeaders);

                // 响应体 → base64 编码返回（避免 Bridge 损坏）
                if (response.body() != null) {
                    byte[] respBytes = response.body().bytes();
                    result.put("body", Base64.getEncoder().encodeToString(respBytes));
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
