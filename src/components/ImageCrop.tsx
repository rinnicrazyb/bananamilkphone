/**
 * 共享裁剪组件 — 固定裁剪框，移动/缩放图片
 *
 * - 裁剪框固定在画布中央，不可移动
 * - 拖拽移动图片本身（平移）
 * - 滚轮/双指缩放图片
 * - 支持圆形（头像）和矩形（壁纸/图标/书封）裁剪
 * - 自适应容器尺寸
 */

import { useRef, useState, useEffect, useCallback } from 'react';

interface ImageCropProps {
  src: string;
  onCrop: (croppedDataUrl: string) => void;
  onCancel: () => void;
  shape?: 'circle' | 'rect';
  /** 矩形宽高比（宽/高），默认 9/16（手机壁纸比例） */
  aspectRatio?: number;
  /** 输出图片宽度（矩形默认 360，圆形默认 200） */
  outputWidth?: number;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 8;

export default function ImageCrop({
  src,
  onCrop,
  onCancel,
  shape = 'rect',
  aspectRatio = 9 / 16,
  outputWidth,
}: ImageCropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [containerSize, setContainerSize] = useState({ w: 320, h: 400 });
  const isRect = shape === 'rect';

  // 图片变换（ref 避免渲染循环）
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const lastPinchDist = useRef(0);

  // 加载图片
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      zoomRef.current = 1;
      panRef.current = { x: 0, y: 0 };
      setLoaded(true);
    };
    img.onerror = () => onCancel();
    img.src = src;
  }, [src, onCancel]);

  // 自适应容器
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ w: Math.round(width), h: Math.round(height) });
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // canvas 尺寸
  const cs = containerSize;

  // ---- 裁剪框尺寸（固定，画布坐标系） ----
  const cropRect = (() => {
    const minDim = Math.min(cs.w, cs.h);
    if (isRect) {
      let cw = cs.w * 0.75;
      let ch = cw / aspectRatio;
      if (ch > cs.h * 0.75) {
        ch = cs.h * 0.75;
        cw = ch * aspectRatio;
      }
      return { x: (cs.w - cw) / 2, y: (cs.h - ch) / 2, w: cw, h: ch };
    } else {
      const size = minDim * 0.55;
      return { x: (cs.w - size) / 2, y: (cs.h - size) / 2, w: size, h: size };
    }
  })();

  // ---- 绘制 ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const fitScale = Math.min(cw / img.width, ch / img.height);
    const zoom = zoomRef.current;
    const pan = panRef.current;
    const scale = fitScale * zoom;

    const imgW = img.width * scale;
    const imgH = img.height * scale;
    const imgX = (cw - imgW) / 2 + pan.x;
    const imgY = (ch - imgH) / 2 + pan.y;

    // 清空
    ctx.clearRect(0, 0, cw, ch);

    // 半透明背景
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, cw, ch);

    // 裁剪区域抠出 → 显示图片
    ctx.save();
    if (isRect) {
      ctx.beginPath();
      ctx.rect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    } else {
      ctx.beginPath();
      ctx.arc(cropRect.x + cropRect.w / 2, cropRect.y + cropRect.h / 2, cropRect.w / 2, 0, Math.PI * 2);
    }
    ctx.clip();
    ctx.drawImage(img, imgX, imgY, imgW, imgH);
    ctx.restore();

    // 裁剪框边框
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 6;
    if (isRect) {
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    } else {
      ctx.beginPath();
      ctx.arc(cropRect.x + cropRect.w / 2, cropRect.y + cropRect.h / 2, cropRect.w / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }, [isRect, cropRect]);

  // 每次 loaded/cropRect 变化重绘
  useEffect(() => {
    if (loaded) draw();
  }, [loaded, draw, cs]);

  // ---- 手势处理 ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      zoomRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * (1 + delta)));
      draw();
    };

    const startDrag = (clientX: number, clientY: number) => {
      isDragging.current = true;
      dragStartRef.current = { x: clientX, y: clientY, panX: panRef.current.x, panY: panRef.current.y };
    };

    const handleMove = (clientX: number, clientY: number) => {
      if (!isDragging.current) return;
      panRef.current = {
        x: dragStartRef.current.panX + (clientX - dragStartRef.current.x),
        y: dragStartRef.current.panY + (clientY - dragStartRef.current.y),
      };
      draw();
    };

    const handleUp = () => { isDragging.current = false; };

    // 鼠标
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    const onMD = (e: MouseEvent) => { e.preventDefault(); startDrag(e.clientX, e.clientY); };
    const onMM = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onMU = () => handleUp();
    canvas.addEventListener('mousedown', onMD);
    document.addEventListener('mousemove', onMM);
    document.addEventListener('mouseup', onMU);

    // 触屏
    const onTS = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        isDragging.current = false;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        lastPinchDist.current = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      }
    };
    const onTM = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && isDragging.current) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        if (lastPinchDist.current > 0) {
          const ratio = dist / lastPinchDist.current;
          zoomRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * ratio));
          draw();
        }
        lastPinchDist.current = dist;
      }
    };
    const onTE = () => { handleUp(); lastPinchDist.current = 0; };
    canvas.addEventListener('touchstart', onTS, { passive: true });
    canvas.addEventListener('touchmove', onTM, { passive: false });
    canvas.addEventListener('touchend', onTE);

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', onMD);
      document.removeEventListener('mousemove', onMM);
      document.removeEventListener('mouseup', onMU);
      canvas.removeEventListener('touchstart', onTS);
      canvas.removeEventListener('touchmove', onTM);
      canvas.removeEventListener('touchend', onTE);
    };
  }, [draw]);

  // ---- 确认裁剪 ----
  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;

    const cw = cs.w;
    const ch = cs.h;
    const fitScale = Math.min(cw / img.width, ch / img.height);
    const zoom = zoomRef.current;
    const pan = panRef.current;
    const scale = fitScale * zoom;
    const imgX = (cw - img.width * scale) / 2 + pan.x;
    const imgY = (ch - img.height * scale) / 2 + pan.y;

    // 裁剪框 → 图片坐标系源区域
    const srcX = (cropRect.x - imgX) / scale;
    const srcY = (cropRect.y - imgY) / scale;
    const srcW = cropRect.w / scale;
    const srcH = cropRect.h / scale;

    const outCanvas = document.createElement('canvas');
    if (isRect) {
      const outW = outputWidth ?? 360;
      const outH = Math.round(outW / aspectRatio);
      outCanvas.width = outW;
      outCanvas.height = outH;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
    } else {
      const size = outputWidth ?? 200;
      outCanvas.width = size;
      outCanvas.height = size;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, size, size);
    }
    onCrop(outCanvas.toDataURL('image/png'));
  };

  return (
    <div className="image-crop-overlay" onClick={onCancel}>
      <div className="image-crop" onClick={(e) => e.stopPropagation()}>
        <h3>{isRect ? '裁剪区域' : '裁剪头像'}</h3>
        <div className="image-crop__canvas-wrap" ref={containerRef}>
          {loaded && (
            <canvas
              ref={canvasRef}
              width={cs.w}
              height={cs.h}
              className="image-crop__canvas"
            />
          )}
        </div>
        <p className="image-crop__hint">拖拽移动图片 · 滚轮缩放</p>
        <div className="image-crop__actions">
          <button className="theme-btn" onClick={onCancel}>取消</button>
          <button className="theme-btn" onClick={handleConfirm}>确认</button>
        </div>
      </div>
    </div>
  );
}
