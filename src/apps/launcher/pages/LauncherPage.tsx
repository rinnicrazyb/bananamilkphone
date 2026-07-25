import AppGrid from '../components/AppGrid';

export default function LauncherPage() {
  return (
    <div className="launcher">
      <div className="launcher__wallpaper" />
      <div className="launcher__content">
        <AppGrid />
      </div>
    </div>
  );
}
