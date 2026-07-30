package com.bananamilkphone.app;

import com.getcapacitor.BridgeActivity;
import androidx.core.view.WindowCompat;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(HttpNativePlugin.class);
        registerPlugin(McpKotlinBridgePlugin.class);
        super.onCreate(savedInstanceState);

        // Edge-to-edge: WebView 铺满全屏，系统状态栏浮在内容之上
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // 隐藏系统状态栏（首次）
        hideSystemBarsDelayed();
    }

    /**
     * 每次窗口获得焦点时重新隐藏系统状态栏。
     * 确保用户从顶部下滑后，状态栏短暂出现再自动消失。
     */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            setImmersiveMode();
        }
    }

    /**
     * 延迟执行隐藏，等待窗口完全初始化（仅首次）。
     */
    private void hideSystemBarsDelayed() {
        getWindow().getDecorView().post(() -> setImmersiveMode());
    }

    /**
     * 设置沉浸模式：隐藏系统状态栏。
     * API 30+ 使用 WindowInsetsController，旧版本使用 systemUiVisibility。
     */
    private void setImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars());
                // 用户从顶部滑动时，系统栏短暂出现后自动消失
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }
    }
}
