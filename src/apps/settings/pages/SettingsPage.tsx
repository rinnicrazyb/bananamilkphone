import { useState } from 'react';
import {
  GearSix,
  Globe,
  Plugs,
  SpeakerHigh,
  DownloadSimple,
  UploadSimple,
  CloudArrowDown,
  Bell,
  Info,
  CaretRight,
  CaretLeft,
} from '@phosphor-icons/react';
import { useSettingsStore } from '../../../store/settings-store';
import type { SettingsSubPage } from '../types';
import ApiSettings from '../components/ApiSettings';
import NetworkSearchPage from './NetworkSearchPage';
import MCPSettingsPage from './MCPSettingsPage';
import BackupPage from './BackupPage';
import RestorePage from './RestorePage';
import WebDAVPage from './WebDAVPage';

/* ───── 子页面路由 ───── */
function renderSubPage(page: SettingsSubPage, onBack: () => void) {
  switch (page) {
    case 'api':
      return <ApiSettings onBack={onBack} />;
    case 'network-search':
      return <NetworkSearchPage onBack={onBack} />;
    case 'mcp':
      return <MCPSettingsPage onBack={onBack} />;
    case 'backup':
      return <BackupPage onBack={onBack} />;
    case 'restore':
      return <RestorePage onBack={onBack} />;
    case 'webdav':
      return <WebDAVPage onBack={onBack} />;
    default:
      return null;
  }
}

/* ───── 小组件：菜单区块 ───── */
function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="settings-menu__section">
      <div className="settings-menu__section-title">{title}</div>
      <div className="settings-menu__section-body">{children}</div>
    </div>
  );
}

/* ───── 小组件：菜单行（有点击动作） ───── */
function MenuRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="settings-menu__item" onClick={onClick} role="button" tabIndex={0}>
      <div className="settings-menu__item-left">
        <span className="settings-menu__item-icon">{icon}</span>
        <span className="settings-menu__item-label">{label}</span>
      </div>
      <CaretRight size={18} className="settings-menu__item-arrow" />
    </div>
  );
}

/* ───── 小组件：菜单行（即将推出） ───── */
function MenuRowComingSoon({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="settings-menu__item settings-menu__item--disabled">
      <div className="settings-menu__item-left">
        <span className="settings-menu__item-icon settings-menu__item-icon--muted">{icon}</span>
        <span className="settings-menu__item-label settings-menu__item-label--muted">{label}</span>
      </div>
      <span className="settings-menu__item-badge">即将推出</span>
    </div>
  );
}

/* ───── 小组件：Toggle 开关 ───── */
function ToggleRow({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="settings-menu__item">
      <div className="settings-menu__item-left">
        <span className="settings-menu__item-icon">{icon}</span>
        <span className="settings-menu__item-label">{label}</span>
      </div>
      <label
        className={`settings-toggle${checked ? ' settings-toggle--on' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="settings-toggle__input"
        />
        <span className="settings-toggle__slider" />
      </label>
    </div>
  );
}

/* ───── 主页面 ───── */
export default function SettingsPage() {
  const [subPage, setSubPage] = useState<SettingsSubPage>(null);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);

  const handleBack = () => setSubPage(null);

  // 如果正在显示子页面，渲染子页面
  const sub = renderSubPage(subPage, handleBack);
  if (sub) return sub;

  // 主菜单
  return (
    <div className="settings-page">
      {/* 顶栏 */}
      <div className="settings-page__header">
        <button className="back-btn" onClick={() => window.history.back()}>
          <CaretLeft size={18} />
        </button>
        <h1>设置</h1>
      </div>

      {/* 主体 */}
      <div className="settings-page__body">
        {/* ── AI 设置 ── */}
        <MenuSection title="AI 设置">
          <MenuRow
            icon={<GearSix size={22} />}
            label="API 设置"
            onClick={() => setSubPage('api')}
          />
          <MenuRow
            icon={<Globe size={22} />}
            label="网络搜索配置"
            onClick={() => setSubPage('network-search')}
          />
          <MenuRow
            icon={<Plugs size={22} />}
            label="MCP 服务器配置"
            onClick={() => setSubPage('mcp')}
          />
          <MenuRowComingSoon
            icon={<SpeakerHigh size={22} />}
            label="TTS 语音配置"
          />
        </MenuSection>

        {/* ── 数据 ── */}
        <MenuSection title="数据">
          <MenuRow
            icon={<DownloadSimple size={22} />}
            label="本地备份"
            onClick={() => setSubPage('backup')}
          />
          <MenuRow
            icon={<UploadSimple size={22} />}
            label="本地恢复"
            onClick={() => setSubPage('restore')}
          />
          <MenuRow
            icon={<CloudArrowDown size={22} />}
            label="WebDAV 同步"
            onClick={() => setSubPage('webdav')}
          />
        </MenuSection>

        {/* ── 通用 ── */}
        <MenuSection title="通用">
          <ToggleRow
            icon={<Bell size={22} />}
            label="消息通知"
            checked={notificationsEnabled}
            onChange={setNotificationsEnabled}
          />
        </MenuSection>

        {/* ── 关于 ── */}
        <MenuSection title="关于">
          <div className="settings-menu__item settings-menu__item--info">
            <div className="settings-menu__item-left">
              <span className="settings-menu__item-icon">
                <Info size={22} />
              </span>
              <div className="settings-menu__info-text">
                <span className="settings-menu__info-version">版本 v0.2.0</span>
                <span className="settings-menu__info-project">香蕉牛奶机 · AI 伴侣小手机</span>
                <span className="settings-menu__info-desc">所有数据仅保存在本地</span>
              </div>
            </div>
          </div>
        </MenuSection>
      </div>

      {/* 底部按钮 */}
      <div className="settings-page__footer">
        <button className="theme-btn" onClick={() => window.history.back()}>
          确认
        </button>
        <button
          className="theme-btn theme-btn--cancel"
          onClick={() => window.history.back()}
        >
          取消
        </button>
      </div>
    </div>
  );
}
