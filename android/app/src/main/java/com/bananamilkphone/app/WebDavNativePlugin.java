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
 * WebDAV 原生 HTTP 插件。
 *
 * 绕过 CapacitorHttp 的 HTTP 方法白名单限制（CapacitorHttp 不支持 PROPFIND/MKCOL），
 * 直接使用 OkHttp 发送任意 HTTP 方法。仅服务于 WebDAV 备份同步，不影响项目中其他
 * HTTP 请求（MCP、LLM、搜索等）。
 *
 * 参考 RikkaHub WebDavClient.kt 的设计：独立 HTTP 客户端，与 MCP/LLM 解耦。
 */
@CapacitorPlugin(name = "WebDavNative")
public class WebDavNativePlugin extends Plugin {

    private OkHttpClient httpClient;

    @Override
    public void load() {
        httpClient = new OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(120, TimeUnit.SECONDS)
                .writeTimeout(120, TimeUnit.SECONDS)
                .followRedirects(true)
                .followSslRedirects(true)
                .build();
    }

    /**
     * 发送任意 HTTP 请求。
     *
     * JS 调用参数：
     *   method:  string   — HTTP 方法（GET/POST/PUT/DELETE/PROPFIND/MKCOL 等）
     *   url:     string   — 完整 URL
     *   headers: object   — 请求头 { "Key": "Value" }
     *   body:    string?  — 请求体（可选）
     *
     * 返回：
     *   status:  number
     *   headers: object   — 响应头
     *   body:    string   — 响应体文本
     */
    @PluginMethod
    public void request(PluginCall call) {
        String method = call.getString("method", "GET");
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
                        : MediaType.parse("application/octet-stream");
                requestBody = RequestBody.create(body, mediaType);
            } else if (method.equalsIgnoreCase("PROPFIND")) {
                // PROPFIND 即使没有 body 也需要一个空的 RequestBody 来避免 OkHttp 默认的 GET body 处理
                requestBody = RequestBody.create("", MediaType.parse("application/xml; charset=utf-8"));
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

                // 响应头
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
            JSObject error = new JSObject();
            error.put("error", e.getMessage());
            call.reject("HTTP request failed: " + e.getMessage(), "IO_ERROR", e);
        } catch (Exception e) {
            call.reject("Unexpected error: " + e.getMessage(), "UNKNOWN_ERROR", e);
        }
    }
}
