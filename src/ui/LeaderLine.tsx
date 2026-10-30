import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { nearestEdgePoint, placeDialog, type Pt } from './placement';

/** A thin fixed-position line from `from` to `to`; hidden when `to` is null (the city is off screen). */
export function LeaderLine({ from, to }: { from: Pt; to: Pt | null }) {
  if (!to) return null;
  return (
    <svg class="leader" aria-hidden="true">
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
      <circle cx={to.x} cy={to.y} r={4} />
    </svg>
  );
}

interface Props {
  /** Screen position of the city's center; null when it is off screen (the dialog is then centered). */
  anchor: Pt | null;
  label: string;
  /** Called for keys pressed while the dialog is open; return true when the key was used. */
  onKey: (e: KeyboardEvent) => boolean;
  children: ComponentChildren;
  /** A wider dialog, for one that shows a card beside its list (narrow screens fall back to the usual width). */
  wide?: boolean;
  /** A newspaper front page: the dialog is the picture, and its children are laid out on it (see .dialog-paper). */
  paper?: boolean;
}

/**
 * A dialog that sits beside the city (or centered), joined to it by a leader line.
 * It listens for keys in the capture phase, so the map's own keys never see them.
 */
export function PlacedDialog({ anchor, label, onKey, children, wide, paper }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 380, h: 440 });
  const [, setResized] = useState(0);
  const keyRef = useRef(onKey);
  keyRef.current = onKey;

  // Measure after each render so the position and the line use the real size.
  useLayoutEffect(() => {
    // The layout size, not the drawn one: a dialog that spins or scales in (the newspaper) must not be measured mid-turn.
    const el = ref.current;
    if (el && (Math.abs(el.offsetWidth - size.w) > 0.5 || Math.abs(el.offsetHeight - size.h) > 0.5)) setSize({ w: el.offsetWidth, h: el.offsetHeight });
  });
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (keyRef.current(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onResize = () => setResized((n) => n + 1);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Dragging the title moves the dialog (and its leader line) so the map underneath can be read.
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });
  const grab = useRef<{ px: number; py: number; dx: number; dy: number } | null>(null);
  const onDown = (e: PointerEvent) => {
    if (!(e.target as HTMLElement).closest('h2')) return;
    grab.current = { px: e.clientX, py: e.clientY, dx: drag.dx, dy: drag.dy };
    ref.current?.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    const g = grab.current;
    if (g) setDrag({ dx: g.dx + e.clientX - g.px, dy: g.dy + e.clientY - g.py });
  };
  const onUp = () => { grab.current = null; };

  const base = placeDialog(anchor, size, { w: window.innerWidth, h: window.innerHeight });
  // Keep the whole dialog on screen however far it is dragged.
  const pos = {
    x: Math.min(Math.max(base.x + drag.dx, 0), Math.max(0, window.innerWidth - size.w)),
    y: Math.min(Math.max(base.y + drag.dy, 0), Math.max(0, window.innerHeight - size.h)),
  };
  const edge = anchor ? nearestEdgePoint({ left: pos.x, top: pos.y, w: size.w, h: size.h }, anchor) : null;
  return (
    <>
      {edge && <LeaderLine from={edge} to={anchor} />}
      <div ref={ref} class={paper ? 'card dialog dialog-paper' : wide ? 'card dialog dialog-wide' : 'card dialog'} role="dialog" aria-label={label} tabIndex={-1} style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {children}
      </div>
    </>
  );
}
