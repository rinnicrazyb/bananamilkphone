import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import {
  ChatCircle,
  Palette,
  GearSix,
  Images,
  GameController,
  BookOpenText,
  Archive,
  Wine,
  BookOpen,
  MusicNote,
} from '@phosphor-icons/react';
import { themeEngine } from './services/theme-engine/index';
import { getItem, setItem } from './services/sqlite/index';
import type { ThemeConfig } from './types';
import LauncherPage from './apps/launcher/pages/LauncherPage';
import ThemePage from './apps/theme/pages/ThemePage';
import AppIconsPage from './apps/theme/pages/AppIconsPage';
import ChatPage from './apps/chat/pages/ChatPage';
import ChatSearchPage from './apps/chat/pages/ChatSearchPage';
import SettingsPage from './apps/settings/pages/SettingsPage';
import { useAppStore } from './store/app-store';
import { usePersistence } from './services/persistence/use-persistence';
import LorebookListPage from './apps/lorebook/pages/LorebookListPage';
import LorebookDetailPage from './apps/lorebook/pages/LorebookDetailPage';

// Placeholder stub pages
const MemoryGallery = () => <div>Memory Gallery — 待开发</div>;
const ArchiveStub = () => <div>Archive — 待开发</div>;
const ArcadeStub = () => <div>Arcade — 待开发</div>;
const TavernStub = () => <div>Tavern — 待开发</div>;
const LibraryStub = () => <div>Library — 待开发</div>;
const MusicStub = () => <div>Music — 待开发</div>;

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LauncherPage />} />
      <Route path="/theme" element={<ThemePage />} />
      <Route path="/theme/app-icons" element={<AppIconsPage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/chat/search/:agentId" element={<ChatSearchPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/lorebook" element={<LorebookListPage />} />
      <Route path="/lorebook/:id" element={<LorebookDetailPage />} />
      <Route path="/memory-gallery" element={<MemoryGallery />} />
      <Route path="/archive" element={<ArchiveStub />} />
      <Route path="/arcade" element={<ArcadeStub />} />
      <Route path="/tavern" element={<TavernStub />} />
      <Route path="/library" element={<LibraryStub />} />
      <Route path="/music" element={<MusicStub />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const theme = useAppStore((s) => s.theme);
  const _themeLoaded = useAppStore((s) => s._themeLoaded);
  const registerApp = useAppStore((s) => s.registerApp);

  // 数据持久化（加载已保存数据 + 自动防抖保存）
  usePersistence();

  // 注册默认 APP
  useEffect(() => {
    const apps = [
      { id: 'chat', name: '聊天', icon: <ChatCircle size={28} />, route: '/chat', enabled: true },
      { id: 'theme', name: '主题', icon: <Palette size={28} />, route: '/theme', enabled: true },
      { id: 'settings', name: '设置', icon: <GearSix size={28} />, route: '/settings', enabled: true },
      { id: 'memory-gallery', name: '记忆游廊', icon: <Images size={28} />, route: '/memory-gallery', enabled: true },
      { id: 'arcade', name: '街机厅', icon: <GameController size={28} />, route: '/arcade', enabled: true },
      { id: 'lorebook', name: '世界书', icon: <BookOpenText size={28} />, route: '/lorebook', enabled: true },
      { id: 'archive', name: '档案馆', icon: <Archive size={28} />, route: '/archive', enabled: true },
      { id: 'tavern', name: '酒馆', icon: <Wine size={28} />, route: '/tavern', enabled: true },
      { id: 'library', name: '图书馆', icon: <BookOpen size={28} />, route: '/library', enabled: true },
      { id: 'music', name: '音乐', icon: <MusicNote size={28} />, route: '/music', enabled: true },
    ];
    apps.forEach(registerApp);
  }, [registerApp]);

  // 同步主题引擎到 store
  useEffect(() => {
    themeEngine.apply(theme);
  }, [theme]);

  // 主题持久化（仅在加载完成后保存，防止首次挂载覆盖 SQLite）
  useEffect(() => {
    if (_themeLoaded) {
      setItem('theme-config', JSON.stringify(theme));
    }
  }, [theme, _themeLoaded]);

  // 加载已保存的主题配置 + 重载字体
  useEffect(() => {
    getItem('theme-config').then((saved) => {
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Partial<ThemeConfig>;
          const store = useAppStore.getState();
          store.updateTheme(parsed);
          themeEngine.apply(parsed);

          // 重载自定义字体
          if (parsed.fontData && parsed.fontFamily) {
            const fontFace = new FontFace(parsed.fontFamily, `url(${parsed.fontData})`);
            fontFace.load().then(() => {
              document.fonts.add(fontFace);
            }).catch(() => {});
          }
        } catch {
          // 静默失败，使用默认主题
        }
      }
      // 标记主题已加载，允许后续保存
      useAppStore.getState()._setThemeLoaded();
    });
  }, []);

  // 加载已保存的自定义图标（桌面初始化即需要）
  useEffect(() => {
    getItem('custom-icons').then((saved) => {
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Record<string, string>;
          const store = useAppStore.getState();
          if (Object.keys(store.customIcons).length === 0) {
            for (const [appId, dataUrl] of Object.entries(parsed)) {
              store.setCustomIcon(appId, dataUrl);
            }
          }
        } catch { /* ignore */ }
      }
    });
  }, []);

  // 打开软件时检查待处理的记忆提取
  useEffect(() => {
    // 延迟执行，不阻塞首次渲染
    const timer = setTimeout(() => {
      import('./apps/chat/store/chat-store').then(({ useChatStore }) => {
        const state = useChatStore.getState();
        for (const agent of state.agents) {
          const config = agent.displayConfig;
          if (!config || !agent.id) continue;

          // 确定是否需要触发
          let shouldTrigger = false;

          if (config.extractionOpenTriggerEnabled) {
            shouldTrigger = true;
          }

          if (config.extractionTimeEnabled && config.extractionTime) {
            const now = new Date();
            const [h, m] = config.extractionTime.split(':').map(Number);
            const todayTarget = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
            if (now.getTime() >= todayTarget.getTime()) {
              const lastExtract = config.lastExtractionTime;
              const todayStart = todayTarget.getTime();
              if (!lastExtract || lastExtract < todayStart) {
                shouldTrigger = true;
              }
            }
          }

          if (!shouldTrigger) continue;

          // 找该智能体的最新对话
          const convs = state.conversations
            .filter((c) => c.agentId === agent.id)
            .sort((a, b) => b.updatedAt - a.updatedAt);
          if (convs.length === 0) continue;

          const conv = convs[0];
          const msgs = state.getCurrentMessages(conv.id);
          const unextracted = msgs.filter((m) => !m.memoryExtracted);
          if (unextracted.length === 0) continue;

          import('./services/memory-extraction/index').then(({ extractMemories }) => {
            extractMemories({
              messages: unextracted,
              agentName: agent.name,
              agentId: agent.id,
              conversationId: conv.id,
              customPrompt: config.extractionPrompt,
            }).then(() => {
              // 更新上次提取时间
              useChatStore.getState().updateAgentDisplayConfig(agent.id, {
                lastExtractionTime: Date.now(),
              });
            }).catch(() => {});
          });
        }
      });
    }, 2000); // 延迟2秒，等页面完全加载

    return () => clearTimeout(timer);
  }, []);

  // 通知服务初始化 + 消息事件监听 + 后台任务通知
  useEffect(() => {
    import('./services/notification/index').then(({ initNotifications, notifyMessageReceived }) => {
      initNotifications();

      // 监听后台任务完成（非活跃对话）
      import('./services/background-task/index').then(({ taskManager }) => {
        taskManager.subscribe((task, event) => {
          if (event !== 'completed') return;
          // 如果任务对应的对话不是当前活跃对话，推送通知
          import('./apps/chat/store/chat-store').then(({ useChatStore }) => {
            const activeId = useChatStore.getState().activeConversationId;
            if (task.conversationId !== activeId) {
              const conv = useChatStore.getState().conversations.find(c => c.id === task.conversationId);
              const agent = useChatStore.getState().agents.find(a => a.id === task.agentId);
              if (conv && agent) {
                notifyMessageReceived(agent.name, '有新回复', `/chat`);
              }
            }
          });
        });
      });

      // 监听 AI 回复完成事件
      import('./services/event-bus/index').then(({ eventBus }) => {
        eventBus.on('chat:message-received', (data: any) => {
          const { conversationId, content } = data;
          if (!content) return;

          // 动态导入 chat-store 判断是否需要弹通知
          import('./apps/chat/store/chat-store').then(({ useChatStore }) => {
            const state = useChatStore.getState();
            if (state.activeConversationId === conversationId) return;

            const conv = state.conversations.find((c) => c.id === conversationId);
            const agent = state.agents.find((a) => a.id === conv?.agentId);
            if (!agent) return;

            notifyMessageReceived(agent.name, content.slice(0, 150), `/chat`);
          });
        });
      });
    });
  }, []);

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
