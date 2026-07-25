package com.bananamilkphone.app;

import com.getcapacitor.BridgeActivity;
import androidx.core.view.WindowCompat;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(HttpNativePlugin.class);
        registerPlugin(McpKotlinBridgePlugin.class);
        super.onCreate(savedInstanceState);

        // Edge-to-edge: WebView 铺满全屏，系统状态栏浮在内容之上
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }
}
