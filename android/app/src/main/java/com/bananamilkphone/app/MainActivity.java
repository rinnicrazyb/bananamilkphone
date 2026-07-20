package com.bananamilkphone.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(HttpNativePlugin.class);
        registerPlugin(McpKotlinBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
