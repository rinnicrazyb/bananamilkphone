import { useRef, useState, useEffect, useCallback } from 'react';

interface AvatarCropProps {
  src: string;
  onCrop: (croppedDataUrl: string) => void;
  onCancel: () => void;
  shape?: 'circle' | 'rect';
}

type RectBox = { x: number; y: number; w: number; h: number };
type CircleBox = { x: number; y: number; size: number };

export default function AvatarCrop({ src, onCrop, onCancel, shape = 'circle' }: AvatarCropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const isRect = shape === 'rect';
  // rect 模式使用 9:16 比例，初始选区宽为图片宽的 80%
  const [box, setBox] = useState<RectBox | CircleBox>(isRect
    ? { x: 0, y: 0, w: 100, h: 178 }
    : { x: 0, y: 0, size: 100 }
  );
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, boxX: 0, boxY: 0 });

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      if (isRect) {
        const w = img.width * 0.8;
        const h = w * (16 / 9);
        setBox({
          x: (img.width - w) / 2,
          y: (img.height - h) / 2,
          w,
          h,
        });
      } else {
        const size = Math.min(img.width, img.height) * 0.6;
        setBox({
          x: (img.width - size) / 2,
          y: (img.height - size) / 2,
          size,
        });
      }
      setLoaded(true);
    };
    img.src = src;
  }, [src, isRect]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scaleX = cw / img.width;
    const scaleY = ch / img.height;
    const scale = Math.min(scaleX, scaleY);

    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    ctx.clearRect(0, 0, cw, ch);

    // 半透明背景
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    if (isRect) {
      const b = box as RectBox;
      const rx = b.x * scale + dx;
      const ry = b.y * scale + dy;
      const rw = b.w * scale;
      const rh = b.h * scale;
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
    } else {
      const b = box as CircleBox;
      const cx = b.x * scale + dx + (b.size * scale) / 2;
      const cy = b.y * scale + dy + (b.size * scale) / 2;
      const r = (b.size * scale) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.clip();
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();

    // 边框
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (isRect) {
      const b = box as RectBox;
      const rx = b.x * scale + dx;
      const ry = b.y * scale + dy;
      ctx.rect(rx, ry, b.w * scale, b.h * scale);
    } else {
      const b = box as CircleBox;
      const cx = b.x * scale + dx + (b.size * scale) / 2;
      const cy = b.y * scale + dy + (b.size * scale) / 2;
      ctx.arc(cx, cy, (b.size * scale) / 2, 0, Math.PI * 2);
    }
    ctx.stroke();
  }, [box, isRect]);

  useEffect(() => {
    if (loaded) draw();
  }, [loaded, draw]);

  // 文档级事件：拖拽期间不受 canvas 边界限制 + 触屏支持
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const getScale = () => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / img.width;
      const scaleY = rect.height / img.height;
      return Math.min(scaleX, scaleY);
    };

    const handleMove = (clientX: number, clientY: number) => {
      if (!isDragging.current) return;
      const scale = getScale();
      const dx = clientX - dragStart.current.x;
      const dy = clientY - dragStart.current.y;
      if (isRect) {
        setBox((prev) => {
          const b = prev as RectBox;
          return {
            ...b,
            x: Math.max(0, Math.min(img.width - b.w, dragStart.current.boxX + dx / scale)),
            y: Math.max(0, Math.min(img.height - b.h, dragStart.current.boxY + dy / scale)),
          };
        });
      } else {
        setBox((prev) => {
          const b = prev as CircleBox;
          return {
            ...b,
            x: Math.max(0, Math.min(img.width - b.size, dragStart.current.boxX + dx / scale)),
            y: Math.max(0, Math.min(img.height - b.size, dragStart.current.boxY + dy / scale)),
          };
        });
      }
    };

    const handleUp = () => { isDragging.current = false; };

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onMouseUp = () => handleUp();
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = () => handleUp();

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [loaded, isRect]);

  const startDrag = (clientX: number, clientY: number) => {
    isDragging.current = true;
    dragStart.current = { x: clientX, y: clientY, boxX: box.x, boxY: box.y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) startDrag(e.touches[0].clientX, e.touches[0].clientY);
  };

  const handleConfirm = () => {
    const outCanvas = document.createElement('canvas');
    const img = imgRef.current;
    if (!outCanvas || !img) return;

    if (isRect) {
      const b = box as RectBox;
      const outW = 360;
      const outH = 640;
      outCanvas.width = outW;
      outCanvas.height = outH;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, b.x, b.y, b.w, b.h, 0, 0, outW, outH);
    } else {
      const b = box as CircleBox;
      const size = 200;
      outCanvas.width = size;
      outCanvas.height = size;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, b.x, b.y, b.size, b.size, 0, 0, size, size);
    }
    onCrop(outCanvas.toDataURL('image/png'));
  };

  return (
    <div className="avatar-crop-overlay" onClick={onCancel}>
      <div className="avatar-crop" onClick={(e) => e.stopPropagation()}>
        <h3>{isRect ? '裁剪背景' : '裁剪头像'}</h3>
        <div className="avatar-crop__canvas-wrap">
          <canvas
            ref={canvasRef}
            width={300}
            height={300}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
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
