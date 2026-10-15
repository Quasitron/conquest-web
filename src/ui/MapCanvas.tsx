import { useEffect, useRef } from 'preact/hooks';
import type { PlayerView, Pos } from '../engine';
import { clampCamera, pan, screenToMap, zoomAt, type Camera } from './camera';
import { drawMap } from './render';
import type { StepTarget } from './targets';

interface Props {
  view: PlayerView;
  cam: Camera;
  setCam: (c: Camera) => void;
  selected: Pos | null;
  targets: StepTarget[];
  colors: string[];
  onSquare: (p: Pos) => void;
  onDeselect: () => void;
}

export function MapCanvas(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(false);
  const pinchDist = useRef(0);
  const camRef = useRef(p.cam);
  camRef.current = p.cam;

  const size = () => {
    const c = ref.current!;
    return { w: c.clientWidth, h: c.clientHeight };
  };
  const setCam = (c: Camera) => {
    const { w, h } = size();
    p.setCam(clampCamera(c, p.view.width, p.view.height, w, h, p.view.wrap));
  };

  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = size();
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMap(ctx, { view: p.view, cam: p.cam, width: w, height: h, selected: p.selected, targets: p.targets, colors: p.colors });
  });

  useEffect(() => {
    const redraw = () => p.setCam({ ...camRef.current });
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, []);

  const local = (e: PointerEvent | WheelEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <canvas
      ref={ref}
      class="map"
      onContextMenu={(e) => { e.preventDefault(); p.onDeselect(); }}
      onWheel={(e) => {
        e.preventDefault();
        const pt = local(e);
        setCam(zoomAt(p.cam, Math.pow(1.1, -e.deltaY / 100), pt.x, pt.y));
      }}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, local(e));
        dragged.current = false;
        if (pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
        }
      }}
      onPointerMove={(e) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev) return;
        const pt = local(e);
        if (pointers.current.size === 2) {
          pointers.current.set(e.pointerId, pt);
          const [a, b] = [...pointers.current.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinchDist.current > 0) setCam(zoomAt(camRef.current, dist / pinchDist.current, (a.x + b.x) / 2, (a.y + b.y) / 2));
          pinchDist.current = dist;
          dragged.current = true;
          return;
        }
        const dx = pt.x - prev.x;
        const dy = pt.y - prev.y;
        if (dragged.current || Math.hypot(dx, dy) > 4) {
          dragged.current = true;
          pointers.current.set(e.pointerId, pt);
          setCam(pan(camRef.current, dx, dy));
        }
      }}
      onPointerUp={(e) => {
        const wasDrag = dragged.current;
        const pt = local(e);
        pointers.current.delete(e.pointerId);
        if (pointers.current.size === 0 && !wasDrag && e.button === 0) {
          const sq = screenToMap(p.cam, p.view.width, p.view.height, p.view.wrap, pt.x, pt.y);
          if (sq) p.onSquare(sq);
        }
      }}
    />
  );
}
