import { useNavigate } from 'react-router-dom';
import type { AppMeta } from '../../../types';

interface AppIconProps {
  app: AppMeta;
  onDragStart: (id: string) => void;
  onDrop: (id: string) => void;
}

export default function AppIcon({ app, onDragStart, onDrop }: AppIconProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(app.route);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', app.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart(app.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId !== app.id) {
      onDrop(app.id);
    }
  };

  return (
    <div
      className="app-icon"
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      title={app.name}
    >
      <div className="app-icon__image">{app.icon}</div>
      <span className="app-icon__label">{app.name}</span>
    </div>
  );
}
