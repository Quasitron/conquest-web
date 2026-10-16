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
}

/**
 * A dialog that sits beside the city (or centered), joined to it by a leader line.
 * It listens for keys in the capture phase, so the map's own keys never see them.
 */
export function PlacedDialog({ anchor, label, onKey, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 380, h: 440 });
  const [, setResized] = useState(0);
  const keyRef = useRef(onKey);
  keyRef.current = onKey;

  // Measure after each render so the position and the line use the real size.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r && (Math.abs(r.width - size.w) > 0.5 || Math.abs(r.height - size.h) > 0.5)) setSize({ w: r.width, h: r.height });
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

  const pos = placeDialog(anchor, size, { w: window.innerWidth, h: window.innerHeight });
  const edge = anchor ? nearestEdgePoint({ left: pos.x, top: pos.y, w: size.w, h: size.h }, anchor) : null;
  return (
    <>
      {edge && <LeaderLine from={edge} to={anchor} />}
      <div ref={ref} class="card dialog" role="dialog" aria-label={label} tabIndex={-1} style={{ left: `${pos.x}px`, top: `${pos.y}px` }}>
        {children}
      </div>
    </>
  );
}
