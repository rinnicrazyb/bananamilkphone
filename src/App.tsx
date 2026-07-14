import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { themeEngine } from './services/theme-engine/index';
import { useAppStore } from './store/app-store';

// Lazy load apps (Phase 1+)
const Launcher = () => <div>Launcher APP — Phase 1</div>;
const Theme = () => <div>Theme APP — Phase 1</div>;
const Chat = () => <div>Chat APP — Phase 2</div>;
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
      <Route path="/" element={<Launcher />} />
      <Route path="/theme" element={<Theme />} />
      <Route path="/chat" element={<Chat />} />
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
