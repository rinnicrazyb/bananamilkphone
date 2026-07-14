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
import LauncherPage from './apps/launcher/pages/LauncherPage';
import ThemePage from './apps/theme/pages/ThemePage';
import ChatPage from './apps/chat/pages/ChatPage';
import SettingsPage from './apps/settings/pages/SettingsPage';
import { useAppStore } from './store/app-store';
import { usePersistence } from './services/persistence/use-persistence';

// Placeholder stub pages
const Lorebook = () => <div>Lorebook APP — Phase 3</div>;
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
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/lorebook" element={<Lorebook />} />
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

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
