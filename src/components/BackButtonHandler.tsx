import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAppStore } from '../store/app-store';

/**
 * 根据当前路径计算"上一级"路由。
 * /chat               → /
 * /theme/app-icons    → /theme
 * /lorebook/xxx       → /lorebook
 * /settings           → /
 * /                   → /
 */
function getParentRoute(path: string): string {
  if (path === '/') return '/';
  const segments = path.split('/').filter(Boolean);
  segments.pop();
  return '/' + segments.join('/');
}

/**
 * 全局 Android 手势返回/物理返回键处理器。
 * 注意：不用 navigate(-1) 或 window.history.go(-1)，
 * 因为在 Capacitor bridge 上下文中第一次调用可能不生效。
 * 改用 getParentRoute() 直接导航到上一级。
 */
export default function BackButtonHandler() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    import('@capacitor/app').then(({ App }) => {
      App.addListener('backButton', () => {
        const path = window.location.pathname;

        // Launcher: 退出应用到真机桌面
        if (path === '/') {
          App.exitApp();
          return;
        }

        // 聊天APP: 对话中→列表, 列表中→Launcher
        if (path === '/chat') {
          import('../apps/chat/store/chat-store').then(({ useChatStore }) => {
            const state = useChatStore.getState();
            if (state.activeConversationId) {
              state.setActiveConversation(null);
            } else {
              navigateRef.current(getParentRoute(path), { replace: true });
            }
          });
          return;
        }

        // 设置APP: 子页面→首页, 首页→Launcher
        if (path === '/settings') {
          const subPage = useAppStore.getState().settingsSubPage;
          if (subPage) {
            useAppStore.getState().setSettingsSubPage(null);
          } else {
            navigateRef.current(getParentRoute(path), { replace: true });
          }
          return;
        }

        // 其他页面: 回到上一级
        navigateRef.current(getParentRoute(path), { replace: true });
      }).then((handle) => {
        cleanup = handle.remove;
      });
    });

    return () => {
      cleanup?.();
    };
  }, []);

  return null;
}
