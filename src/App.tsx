import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { themeEngine } from './services/theme-engine/index';
import LauncherPage from './apps/launcher/pages/LauncherPage';
import ThemePage from './apps/theme/pages/ThemePage';
import ChatPage from './apps/chat/pages/ChatPage';
import { useAppStore } from './store/app-store';

// Placeholder stub pages
const Settings = () => <div>Settings APP — Phase 3</div>;
const Lorebook = () => <div>Lorebook APP — Phase 3</div>;
const MemoryGallery = () => <div>Memory Gallery — 待开发</div>;
const Archive = () => <div>Archive — 待开发</div>;
const Arcade = () => <div>Arcade — 待开发</div>;
const Tavern = () => <div>Tavern — 待开发</div>;
const Library = () => <div>Library — 待开发</div>;
const Music = () => <div>Music — 待开发</div>;

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LauncherPage />} />
      <Route path="/theme" element={<ThemePage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/lorebook" element={<Lorebook />} />
      <Route path="/memory-gallery" element={<MemoryGallery />} />
      <Route path="/archive" element={<Archive />} />
      <Route path="/arcade" element={<Arcade />} />
      <Route path="/tavern" element={<Tavern />} />
      <Route path="/library" element={<Library />} />
      <Route path="/music" element={<Music />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const theme = useAppStore((s) => s.theme);
  const registerApp = useAppStore((s) => s.registerApp);

  // 注册默认 APP
  useEffect(() => {
    const apps = [
      { id: 'chat', name: '聊天', icon: '💬', route: '/chat', enabled: true },
      { id: 'theme', name: '主题', icon: '🎨', route: '/theme', enabled: true },
      { id: 'settings', name: '设置', icon: '⚙️', route: '/settings', enabled: true },
      { id: 'memory-gallery', name: '记忆游廊', icon: '🖼️', route: '/memory-gallery', enabled: true },
      { id: 'arcade', name: '街机厅', icon: '🎮', route: '/arcade', enabled: true },
      { id: 'lorebook', name: '世界书', icon: '📖', route: '/lorebook', enabled: true },
      { id: 'archive', name: '档案馆', icon: '🏛️', route: '/archive', enabled: true },
      { id: 'tavern', name: '酒馆', icon: '🍺', route: '/tavern', enabled: true },
      { id: 'library', name: '图书馆', icon: '📚', route: '/library', enabled: true },
      { id: 'music', name: '音乐', icon: '🎵', route: '/music', enabled: true },
    ];
    apps.forEach(registerApp);
  }, [registerApp]);

  // 同步主题引擎到 store
  useEffect(() => {
    themeEngine.apply(theme);
  }, [theme]);

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
