import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

// Finger/stylus/mouse signature box. Smooth strokes, no page scrolling while
// signing, and exports a compact PNG (max 600px wide) for storage.

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string;
}

interface Props { onChange?: (hasSignature: boolean) => void; height?: number; }

const SignaturePad = forwardRef<SignaturePadHandle, Props>(({ onChange, height = 220 }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const points = useRef<{ x: number; y: number }[]>([]);
  const inkLength = useRef(0);
  const [empty, setEmpty] = useState(true);

  // Size the canvas to its box at device pixel ratio (crisp on phones)
  useEffect(() => {
    const canvas = canvasRef.current!;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const { width } = canvas.getBoundingClientRect();
      // Keep existing ink when the phone rotates
      const old = inkLength.current > 0 ? canvas.toDataURL() : null;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(ratio, ratio);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0b1f4d';
      ctx.lineWidth = 2.6;
      if (old) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, width, height);
        img.src = old;
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [height]);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = pos(e);
    points.current = [p];
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#0b1f4d';
    ctx.fill();
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    const pts = points.current;
    const p = pos(e);
    const last = pts[pts.length - 1];
    inkLength.current += Math.hypot(p.x - last.x, p.y - last.y);
    pts.push(p);
    if (pts.length < 3) return;
    // Quadratic curve through midpoints → smooth line
    const [a, b, c] = pts.slice(-3);
    ctx.beginPath();
    ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
    ctx.stroke();
    if (empty && inkLength.current > 25) { setEmpty(false); onChange?.(true); }
  };

  const end = () => { drawing.current = false; points.current = []; };

  useImperativeHandle(ref, () => ({
    clear() {
      const c = canvasRef.current!;
      c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
      inkLength.current = 0;
      setEmpty(true);
      onChange?.(false);
    },
    isEmpty: () => inkLength.current <= 25,
    toDataURL() {
      // Export on a white background, scaled down to keep the record small
      const src = canvasRef.current!;
      const w = Math.min(600, src.getBoundingClientRect().width);
      const scale = w / src.getBoundingClientRect().width;
      const out = document.createElement('canvas');
      out.width = Math.round(w);
      out.height = Math.round(height * scale);
      const ctx = out.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(src, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    },
  }), [height, onChange]);

  return (
    <div className="relative rounded-2xl bg-white border-2 border-dashed border-blue-300 overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        style={{ height, touchAction: 'none' }}
        className="block w-full cursor-crosshair"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      />
      {/* Signing line + hint (not part of the saved image) */}
      <div className="pointer-events-none absolute left-6 right-6 bottom-12 border-b-2 border-blue-100" />
      <div className="pointer-events-none absolute left-6 bottom-5 text-blue-300 text-xs font-semibold">✕ Sign above the line</div>
      {empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-blue-200 text-2xl font-semibold">
          ✍️ Sign here
        </div>
      )}
    </div>
  );
});

export default SignaturePad;
