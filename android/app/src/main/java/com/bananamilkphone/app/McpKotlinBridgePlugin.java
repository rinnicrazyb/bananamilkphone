package com.bananamilkphone.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * MCP Kotlin 桥接插件。
 *
 * 将 JS 端的 MCP 操作转发到 McpKotlinService（Kotlin MCP SDK + Ktor + OkHttp），
 * 完全绕过 Capacitor Bridge 的 HTTP body 传输问题。
 *
 * JS 调用：
 *   connect({ serverId, config: { url, headers } })
 *   disconnect({ serverId })
 *   callTool({ serverId, toolName, args })
 */
@CapacitorPlugin(name = "McpKotlinBridge")
public class McpKotlinBridgePlugin extends Plugin {

    @PluginMethod
    public void connect(PluginCall call) {
        String serverId = call.getString("serverId");
        JSObject config = call.getObject("config");

        if (serverId == null || config == null) {
            call.reject("serverId and config are required");
            return;
        }

        String configJson = config.toString();

        McpKotlinService.connectSync(serverId, configJson, (tools, error) -> {
            if (error != null) {
                call.reject(error);
            } else {
                JSObject result = new JSObject();
                result.put("tools", tools);
                call.resolve(result);
            }
            return kotlin.Unit.INSTANCE;
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        String serverId = call.getString("serverId");
        if (serverId == null) {
            call.reject("serverId is required");
            return;
        }
        McpKotlinService.disconnectSync(serverId);
        call.resolve();
    }

    @PluginMethod
    public void callTool(PluginCall call) {
        String serverId = call.getString("serverId");
        String toolName = call.getString("toolName");
        String argsJson = call.getString("args");

        if (serverId == null || toolName == null) {
            call.reject("serverId and toolName are required");
            return;
        }

        McpKotlinService.callToolSync(serverId, toolName,
            argsJson != null ? argsJson : "{}",
            (result, error) -> {
                if (error != null) {
                    call.reject(error);
                } else {
                    JSObject jsResult = new JSObject();
                    jsResult.put("content", result);
                    call.resolve(jsResult);
                }
                return kotlin.Unit.INSTANCE;
            }
        );
    }
}
