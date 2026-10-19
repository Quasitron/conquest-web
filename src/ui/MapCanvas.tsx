import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Fight } from './fights';
import type { PlayerView, Pos, UnitType } from '../engine';
import { clampCamera, pan, screenToMap, zoomAt, type Camera } from './camera';
import { drawMap } from './render';
import type { StepTarget } from './targets';
import { useBlink } from './useBlink';
import { boxBetween, rawSquareAt, type GroupBox } from './group';

interface Props {
  view: PlayerView;
  cam: Camera;
  setCam: (c: Camera) => void;
  selected: Pos | null;
  targets: StepTarget[];
  colors: string[];
  onSquare: (p: Pos) => void;
  /** Pointer over a square; null when it leaves the map. */
  onHover: (p: Pos | null) => void;
  /** Right-click, or a long-press on touch; client is in viewport coordinates. */
  onContext: (p: Pos, client: { x: number; y: number }) => void;
  activeId: number | null;
  /** Blink the active unit only while the game is being played. */
  blinkActive: boolean;
  /** Double-click on a square. */
  onDouble: (p: Pos) => void;
  path: Pos[] | null;
  pathOk: boolean;
  pathLabel: string | null;
  pathTarget: Pos | null;
  route: Pos[] | null;
  routeLabel: string | null;
  patrols?: [Pos, Pos][];
  productionMap?: boolean;
  flash?: Pos | null;
  /** Fights to play out: `start` is a performance.now() time. The map repaints every frame while any is running. */
  fx?: ActiveFx[];
  /** Fights of a replay still to come, drawn as they were before the fight. */
  pending?: Fight[];
  cityRoutes?: { from: Pos; to: Pos; types: UnitType[] }[];
  attack: { at: Pos; label: string } | null;
  /** The user zoomed with the wheel or a pinch (turns auto-fit off). */
  onZoom?: () => void;
  /** Group mode is waiting for a box: a drag draws it instead of panning (Shift+drag does too, with a mouse). */
  boxMode?: boolean;
  /** The box as dragged so far, drawn in yellow. */
  groupBox?: GroupBox | null;
  /** The box changed while dragging; null when the drag was cancelled. */
  onBox?: (box: GroupBox | null) => void;
  /** The box was released. */
  onBoxDone?: (box: GroupBox) => void;
}

/** A fight playing out on the map. */
export interface ActiveFx {
  fight: Fight;
  /** performance.now() when it began. */
  start: number;
  duration: number;
}

export function MapCanvas(p: Props) {
  // The blink state lives here so a tick redraws only the canvas, not the whole game screen.
  const blinkOn = useBlink(p.blinkActive);
  // While fights are playing, repaint every animation frame; the loop stops as soon as there are none.
  const [, setFrame] = useState(0);
  const animating = !!p.fx && p.fx.length > 0;
  useEffect(() => {
    if (!animating) return;
    let id = 0;
    const loop = () => {
      setFrame((n) => n + 1);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [animating]);
  const ref = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(false);
  const pinchDist = useRef(0);
  const pressTimer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
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

  // Layout effect: the canvas is repainted before the browser paints, so it never shows a frame of old props.
  useLayoutEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = size();
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMap(ctx, {
      view: p.view, cam: p.cam, width: w, height: h, selected: p.selected, targets: p.targets, colors: p.colors,
      activeId: p.activeId, blinkOn, path: p.path, pathOk: p.pathOk, pathLabel: p.pathLabel, pathTarget: p.pathTarget,
      route: p.route, routeLabel: p.routeLabel, patrols: p.patrols, productionMap: p.productionMap, flash: p.flash,
      fx: p.fx?.map((a) => ({ fight: a.fight, age: performance.now() - a.start, duration: a.duration })),
      pending: p.pending, cityRoutes: p.cityRoutes, attack: p.attack,
      groupBox: p.groupBox,
    });
  });

  useEffect(() => {
    const redraw = () => p.setCam({ ...camRef.current });
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, []);

  const clearPress = () => {
    window.clearTimeout(pressTimer.current);
    pressTimer.current = undefined;
  };
  useEffect(() => clearPress, []);

  const squareAt = (pt: { x: number; y: number }) =>
    screenToMap(camRef.current, p.view.width, p.view.height, p.view.wrap, pt.x, pt.y);

  // A Group mode box drag in progress: the pointer drawing it and the square it started on.
  const boxDrag = useRef<{ id: number; start: Pos } | null>(null);
  const rawAt = (pt: { x: number; y: number }) =>
    rawSquareAt(camRef.current, p.view.width, p.view.height, p.view.wrap, pt.x, pt.y);

  const local = (e: PointerEvent | WheelEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <canvas
      ref={ref}
      class="map"
      onContextMenu={(e) => {
        e.preventDefault();
        if (longPressed.current) return; // the touch long-press already opened it
        const sq = squareAt(local(e as unknown as PointerEvent));
        if (sq) p.onContext(sq, { x: e.clientX, y: e.clientY });
      }}
      onDblClick={(e) => {
        const sq = squareAt(local(e as unknown as PointerEvent));
        if (sq) p.onDouble(sq);
      }}
      onPointerLeave={() => p.onHover(null)}
      onWheel={(e) => {
        e.preventDefault();
        const pt = local(e);
        p.onZoom?.();
        setCam(zoomAt(p.cam, Math.pow(1.1, -e.deltaY / 100), pt.x, pt.y));
      }}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        if (e.button === 0 && pointers.current.size === 0 && (p.boxMode || (e.shiftKey && e.pointerType === 'mouse'))) {
          const start = rawAt(local(e));
          boxDrag.current = { id: e.pointerId, start };
          pointers.current.set(e.pointerId, local(e));
          p.onBox?.(boxBetween(start, start, p.view.width));
          return;
        }
        pointers.current.set(e.pointerId, local(e));
        dragged.current = false;
        longPressed.current = false;
        clearPress();
        if (pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
        } else if (e.pointerType === 'touch') {
          const start = local(e);
          const { clientX, clientY } = e;
          pressTimer.current = window.setTimeout(() => {
            pressTimer.current = undefined;
            const sq = squareAt(start);
            if (!sq || dragged.current) return;
            longPressed.current = true;
            p.onContext(sq, { x: clientX, y: clientY });
          }, 500);
        }
      }}
      onPointerMove={(e) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev) {
          if (e.pointerType !== 'touch') p.onHover(squareAt(local(e)));
          return;
        }
        const pt = local(e);
        if (boxDrag.current) {
          if (boxDrag.current.id === e.pointerId) p.onBox?.(boxBetween(boxDrag.current.start, rawAt(pt), p.view.width));
          return;
        }
        if (Math.hypot(pt.x - prev.x, pt.y - prev.y) > 4) clearPress();
        if (pointers.current.size === 2) {
          pointers.current.set(e.pointerId, pt);
          const [a, b] = [...pointers.current.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinchDist.current > 0) p.onZoom?.();
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
      onPointerCancel={(e) => {
        if (boxDrag.current?.id === e.pointerId) {
          boxDrag.current = null;
          p.onBox?.(null);
        }
        clearPress();
        pointers.current.delete(e.pointerId);
        dragged.current = false;
        pinchDist.current = 0;
      }}
      onPointerUp={(e) => {
        const bd = boxDrag.current;
        if (bd) {
          if (bd.id === e.pointerId) {
            boxDrag.current = null;
            pointers.current.delete(e.pointerId);
            p.onBoxDone?.(boxBetween(bd.start, rawAt(local(e)), p.view.width));
          }
          return;
        }
        const wasDrag = dragged.current;
        const pt = local(e);
        clearPress();
        pointers.current.delete(e.pointerId);
        if (pointers.current.size === 0 && !wasDrag && !longPressed.current && e.button === 0) {
          const sq = squareAt(pt);
          if (sq) p.onSquare(sq);
        }
      }}
    />
  );
}
