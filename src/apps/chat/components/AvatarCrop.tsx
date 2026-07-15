import { useRef, useState, useEffect, useCallback } from 'react';

interface AvatarCropProps {
  src: string;
  onCrop: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

export default function AvatarCrop({ src, onCrop, onCancel }: AvatarCropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [box, setBox] = useState({ x: 0, y: 0, size: 100 });
  const dragRef = useRef<{ startX: number; startY: number; boxX: number; boxY: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const size = Math.min(img.width, img.height) * 0.6;
      setBox({
        x: (img.width - size) / 2,
        y: (img.height - size) / 2,
        size,
      });
      setLoaded(true);
    };
    img.src = src;
  }, [src]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 缩放比例
    const scaleX = cw / img.width;
    const scaleY = ch / img.height;
    const scale = Math.min(scaleX, scaleY);

    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    ctx.clearRect(0, 0, cw, ch);

    // 绘制半透明背景
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, cw, ch);

    // 裁剪区域（圆形孔）
    ctx.save();
    ctx.beginPath();
    const cx = box.x * scale + dx + (box.size * scale) / 2;
    const cy = box.y * scale + dy + (box.size * scale) / 2;
    const r = (box.size * scale) / 2;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    // 在孔内绘制原图
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();

    // 绘制边框
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }, [box]);

  useEffect(() => {
    if (loaded) draw();
  }, [loaded, draw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, boxX: box.x, boxY: box.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const img = imgRef.current;
    if (!img) return;
    const scaleX = rect.width / img.width;
    const scaleY = rect.height / img.height;
    const scale = Math.min(scaleX, scaleY);
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setBox((prev) => ({
      ...prev,
      x: Math.max(0, Math.min(img.width - prev.size, dragRef.current!.boxX + dx / scale)),
      y: Math.max(0, Math.min(img.height - prev.size, dragRef.current!.boxY + dy / scale)),
    }));
  };

  const handleMouseUp = () => {
    dragRef.current = null;
  };

  const handleConfirm = () => {
    const canvas = document.createElement('canvas');
    const img = imgRef.current;
    if (!canvas || !img) return;
    const size = 200;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, box.x, box.y, box.size, box.size, 0, 0, size, size);
    onCrop(canvas.toDataURL('image/png'));
  };

  return (
    <div className="avatar-crop-overlay" onClick={onCancel}>
      <div className="avatar-crop" onClick={(e) => e.stopPropagation()}>
        <h3>裁剪头像</h3>
        <div className="avatar-crop__canvas-wrap">
          <canvas
            ref={canvasRef}
            width={300}
            height={300}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>
        <p className="avatar-crop__hint">拖拽移动选择区域</p>
        <div className="avatar-crop__actions">
          <button className="theme-btn" onClick={onCancel}>取消</button>
          <button className="theme-btn" onClick={handleConfirm}>确认</button>
        </div>
      </div>
    </div>
  );
}
