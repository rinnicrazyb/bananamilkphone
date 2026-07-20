import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../store/app-store';
import type { AppMeta } from '../../../types';

interface AppIconProps {
  app: AppMeta;
  className?: string;
}

export default function AppIcon({ app, className = '' }: AppIconProps) {
  const navigate = useNavigate();
  const customIcon = useAppStore((s) => s.customIcons[app.id]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(app.route);
  };

  return (
    <div
      className={`app-icon ${className}`}
      data-app-id={app.id}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      title={app.name}
    >
      <div className="app-icon__image">
        {customIcon ? (
          <img src={customIcon} alt={app.name} className="app-icon__custom-img" />
        ) : (
          app.icon
        )}
      </div>
      <span className="app-icon__label">{app.name}</span>
    </div>
  );
}
